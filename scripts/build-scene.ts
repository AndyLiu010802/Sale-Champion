import fs from 'node:fs';
import path from 'node:path';
import { mulberry32 } from '../src/lib/scene/types';

const SRC = path.join(process.cwd(), 'public', 'scene', 'hobart.svg');
const OUT = path.join(process.cwd(), 'src', 'lib', 'scene', 'sceneSvg.ts');

/** <defs> 里的渐变按 id 前缀归组:mountainSoft* 归 mountain-contours(用它们的路径就在该
 *  组里,§7b 截图目验发现归到 mountains 会在夜档等档位上叠出颜色偏离的斑),waterGrad
 *  归水,其余归天空。 */
function groupForGradient(id: string): string {
  if (id.startsWith('mountain')) return 'mountain-contours';
  if (id.startsWith('water')) return 'water';
  return 'sky';
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** 同组内亮度差 < TOL 的颜色归为同一个槽 —— 原画的明暗层次靠 lum 保留,不靠槽数。 */
const TOL = 0.04;

type Slot = { id: string; group: string; lum: number };

function build(): { svg: string; slots: Slot[] } {
  const src = fs.readFileSync(SRC, 'utf8');
  const slots: Slot[] = [];
  const byGroup = new Map<string, Slot[]>();

  const slotFor = (group: string, hex: string): string => {
    const lum = luminance(hex);
    const pool = byGroup.get(group) ?? [];
    const hit = pool.find((s) => Math.abs(s.lum - lum) < TOL);
    if (hit) return hit.id;
    const slot: Slot = { id: `s${slots.length}`, group, lum };
    slots.push(slot);
    pool.push(slot);
    byGroup.set(group, pool);
    return slot.id;
  };

  // 逐行扫描:<g id> 入栈、</g> 出栈;<linearGradient id> 切换 defs 内的归属。
  const stack: string[] = [];
  let group = 'sky';        // <defs> 之前的元素(无)与兜底
  let gradGroup: string | null = null;

  let cloudIdx = 0;
  // 灯位阈值用固定种子,保证每次构建产物一致(mulberry32,与场景其余随机同源)。
  const lampRand = mulberry32(4242);
  const out = src.split('\n').map((line) => {
    const gm = /<g id="([^"]+)"/.exec(line);
    if (gm) { stack.push(group); group = gm[1]; }
    const dm = /<(?:linear|radial)Gradient id="([^"]+)"/.exec(line);
    if (dm) gradGroup = groupForGradient(dm[1]);
    if (line.includes('</linearGradient>') || line.includes('</radialGradient>')) gradGroup = null;

    const owner = gradGroup ?? group;
    let rewritten = line.replace(
      /(fill|stroke|stop-color)="(#[0-9A-Fa-f]{6})"/g,
      (_m, attr: string, hex: string) => `${attr}="var(--${slotFor(owner, hex.toUpperCase())})"`,
    );

    // 动态分组:开组标签加类名;云是逐朵包裹,所以在组内按行处理。
    if (gm) {
      const cls: Record<string, string> = {  // eslint-disable-line
        'water-sparkles': 'scene-sparkle" style="animation-duration:7s,220s',
        'foreground-ripples': 'scene-ripple" style="animation-duration:180s',
        'reflections': 'scene-reflect" style="animation-duration:9s',
        'stars': 'scene-stars',
      };
      const c = cls[gm[1]];
      if (c) rewritten = rewritten.replace(`<g id="${gm[1]}"`, `<g id="${gm[1]}" class="${c}"`);
    } else if (group === 'hillside-houses' && line.trimStart().startsWith('<rect')) {
      // 灯位:每个元素带自己的阈值,运行时按 windowLit 逐个开关(见下方"灯光机制")。
      rewritten = rewritten.replace('<rect ', `<rect class="scene-lamp" data-t="${lampRand().toFixed(4)}" `);
    } else if (group === 'city' && /fill="var\(--s\d+\)"/.test(rewritten) && line.includes('rx="0.5"')) {
      rewritten = rewritten.replace('<rect ', `<rect class="scene-lamp" data-t="${lampRand().toFixed(4)}" `);
    } else if (group === 'sky-clouds' && line.trimStart().startsWith('<path')) {
      // 每朵云单独包一层:速度 120/165/210/255s 循环,负延迟错开起始位置。
      const dur = 120 + (cloudIdx % 4) * 45;
      rewritten = `<g class="scene-cloud" data-i="${cloudIdx}" `
        + `style="animation-duration:${dur}s;animation-delay:-${cloudIdx * 17}s">${rewritten}</g>`;
      cloudIdx += 1;
    }

    if (line.includes('</g>') && stack.length) group = stack.pop()!;
    return rewritten;
  }).join('\n');

  const svg = out.replace(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1832" height="859" viewBox="0 0 1832 859" fill="none">',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1832 859" fill="none" '
    + 'preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block">');
  return { svg, slots };
}

const { svg, slots } = build();
fs.writeFileSync(OUT,
  `// 构建产物 —— 由 scripts/build-scene.ts 从 public/scene/hobart.svg 生成,请勿手改。\n`
  + `// 重新生成:npm run build:scene\n\n`
  + `export type SceneSlot = { id: string; group: string; lum: number };\n\n`
  + `export const SCENE_SLOTS: SceneSlot[] = ${JSON.stringify(slots, null, 2)};\n\n`
  + `export const SCENE_SVG = ${JSON.stringify(svg)};\n`,
  'utf8');
console.log(`[build-scene] ${slots.length} slots across ${new Set(slots.map((s) => s.group)).size} groups`);
