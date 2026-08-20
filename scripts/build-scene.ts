import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'public', 'scene', 'hobart.svg');
const OUT = path.join(process.cwd(), 'src', 'lib', 'scene', 'sceneSvg.ts');

/** <defs> 里的渐变按 id 前缀归组:mountainSoft* 归山体,waterGrad 归水,其余归天空。 */
function groupForGradient(id: string): string {
  if (id.startsWith('mountain')) return 'mountains';
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

  const out = src.split('\n').map((line) => {
    const gm = /<g id="([^"]+)"/.exec(line);
    if (gm) { stack.push(group); group = gm[1]; }
    const dm = /<(?:linear|radial)Gradient id="([^"]+)"/.exec(line);
    if (dm) gradGroup = groupForGradient(dm[1]);
    if (line.includes('</linearGradient>') || line.includes('</radialGradient>')) gradGroup = null;

    const owner = gradGroup ?? group;
    const rewritten = line.replace(
      /(fill|stroke|stop-color)="(#[0-9A-Fa-f]{6})"/g,
      (_m, attr: string, hex: string) => `${attr}="var(--${slotFor(owner, hex.toUpperCase())})"`,
    );
    if (line.includes('</g>') && stack.length) group = stack.pop()!;
    return rewritten;
  }).join('\n');

  return { svg: out, slots };
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
