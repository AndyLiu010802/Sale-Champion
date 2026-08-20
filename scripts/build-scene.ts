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

/**
 * 星星与日月光晕/本体不走色槽的组内亮度归一化(Task 7):那套机制是为"同组多槽靠亮度差
 * 还原层次"设计的。星星全组恒定同一个颜色,套上去只会被合并成 1 个槽,没意义;
 * 光晕与本体只有两个语义色且亮度天然接近(光晕就是围着日月的柔光),硬要在色带两端
 * 拉开层次会跟 slots.ts "从不压平一组"的测试打架。改成两个固定、非编号的 CSS 变量,
 * 值仍由装配器每帧从 ScenePaint 写入(见 SceneBackground.tsx),只是不进 SCENE_SLOTS 名册。
 */
const NON_SLOT_GROUPS = new Set(['stars', 'celestial']);

type Slot = { id: string; group: string; lum: number };

/** 预扫一遍数出灯位总数——分层阈值要先知道 N。判定条件与下面改写时逐字一致。 */
function countLamps(src: string): number {
  const stack: string[] = [];
  let group = 'sky';
  let n = 0;
  for (const line of src.split('\n')) {
    const gm = /<g id="([^"]+)"/.exec(line);
    if (gm) { stack.push(group); group = gm[1]; }
    if (group === 'hillside-houses' && line.trimStart().startsWith('<rect')) n += 1;
    else if (group === 'city' && line.includes('rx="0.5"') && line.includes('<rect')) n += 1;
    if (line.includes('</g>') && stack.length) group = stack.pop()!;
  }
  return n;
}

/** 0..n-1 的固定种子洗牌(Fisher–Yates),用来把分层名次打散到各个灯位上。 */
function shuffledRanks(n: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 把某个分组的内容在右侧再复制一份(整体 translate 一个画幅宽),使它在 x 方向以画幅为周期。
 * 配合 globals.css 里"整组左移正好一个画幅"的动画,循环点前后画面完全重合,没有接缝。
 */
function duplicateForLoop(svg: string, groupId: string): string {
  const open = svg.indexOf(`<g id="${groupId}"`);
  if (open < 0) throw new Error(`duplicateForLoop: 找不到分组 ${groupId}`);
  const bodyStart = svg.indexOf('>', open) + 1;
  const close = svg.indexOf('</g>', bodyStart);
  if (close < 0) throw new Error(`duplicateForLoop: 分组 ${groupId} 没有闭合`);
  const body = svg.slice(bodyStart, close);
  const copy = `<g transform="translate(1832,0)">${body}</g>`;
  return svg.slice(0, close) + copy + svg.slice(close);
}

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
  let sparkleIdx = 0;

  // 灯位阈值走**分层**而不是各自独立随机:先数出灯位总数 N,再把 0..N-1 用固定种子洗牌,
  // 第 k 个遇到的灯位拿到阈值 (shuffled[k] + 0.5) / N。
  //
  // 为什么不各自独立取随机数:那样"白天亮几盏"要看种子运气。Task 7 交付时实测就是 0 盏——
  // 254 个阈值里最小的是 0.0091,而 DAY_BASE 是 0.0075,整批恰好全部落空,设计要的
  // "白天零星两三盏"一盏都不剩。分层之后点亮数恒为 floor(lit × N):白天 2 盏、夜间 234 盏,
  // 与种子无关;洗牌保证"亮的是哪几盏"依然是散开的,不会连成一片。
  const lampTotal = countLamps(src);
  const lampOrder = shuffledRanks(lampTotal, 4242);
  let lampIdx = 0;
  const nextLampThreshold = () =>
    ((lampOrder[lampIdx++] + 0.5) / lampTotal).toFixed(4);
  const out = src.split('\n').map((line) => {
    const gm = /<g id="([^"]+)"/.exec(line);
    if (gm) { stack.push(group); group = gm[1]; }
    const dm = /<(?:linear|radial)Gradient id="([^"]+)"/.exec(line);
    if (dm) gradGroup = groupForGradient(dm[1]);
    if (line.includes('</linearGradient>') || line.includes('</radialGradient>')) gradGroup = null;

    const owner = gradGroup ?? group;
    let rewritten: string;
    if (NON_SLOT_GROUPS.has(group)) {
      // 不进色槽:改写成固定的非编号 CSS 变量,fallback 就是原画的占位色(见 NON_SLOT_GROUPS
      // 上方注释)。装配器每帧覆盖 --celestial-glow/--celestial-body;--star-color 从不被
      // JS 写,永远吃这里的 fallback —— 星星只需要常量白,不需要随时段变色。
      rewritten = line.replace(/(fill|stroke)="(#[0-9A-Fa-f]{6})"/, (m, attr: string, hex: string) => {
        if (line.includes('scene-star')) return `${attr}="var(--star-color, ${hex})"`;
        if (line.includes('scene-celestial-glow')) return `${attr}="var(--celestial-glow, ${hex})"`;
        if (line.includes('scene-celestial-body')) return `${attr}="var(--celestial-body, ${hex})"`;
        return m; // stars/celestial 组里没有别的带色元素
      });
    } else {
      rewritten = line.replace(
        /(fill|stroke|stop-color)="(#[0-9A-Fa-f]{6})"/g,
        (_m, attr: string, hex: string) => `${attr}="var(--${slotFor(owner, hex.toUpperCase())})"`,
      );
    }

    // 动态分组:开组标签加类名;云/碎光是逐元素处理,所以在组内按行处理。
    if (gm) {
      const cls: Record<string, string> = {  // eslint-disable-line
        'reflections': 'scene-reflect" style="animation-duration:9s',
      };
      const c = cls[gm[1]];
      if (c) rewritten = rewritten.replace(`<g id="${gm[1]}"`, `<g id="${gm[1]}" class="${c}"`);
    } else if (group === 'hillside-houses' && line.trimStart().startsWith('<rect')) {
      // 灯位:每个元素带自己的阈值(--t),运行时靠 CSS 阈值比较逐个开关
      // (globals.css .scene-lamp;Task 7 —— 换掉失效的 querySelectorAll + inline display)。
      rewritten = rewritten.replace('<rect ', `<rect class="scene-lamp" style="--t:${nextLampThreshold()}" `);
    } else if (group === 'city' && /fill="var\(--s\d+\)"/.test(rewritten) && line.includes('rx="0.5"')) {
      rewritten = rewritten.replace('<rect ', `<rect class="scene-lamp" style="--t:${nextLampThreshold()}" `);
    } else if (group === 'water-sparkles' && line.trimStart().startsWith('<rect')) {
      // 碎光拆 4 组错开呼吸相位与漂移起点,不再整片同步呼吸(按遇到顺序轮询分桶,
      // 构建产物因此稳定可重现;设计 §5 "拆 4 个子层错开相位")。
      // 只错开**呼吸**相位;横向流动由整组平移负责(globals.css #water-sparkles),
      // 早先让每个矩形各自漂移再弹回,看起来是乱抖而不是水流。
      const breatheDelay = ((sparkleIdx % 4) * 7) / 4;
      rewritten = rewritten.replace('<rect ',
        `<rect class="scene-sparkle" style="animation-delay:-${breatheDelay}s" `);
      sparkleIdx += 1;
    } else if (group === 'sky-clouds' && line.trimStart().startsWith('<path')) {
      // 每朵云单独包一层:速度 120/165/210/255s 循环,负延迟错开起始位置。显示朵数阈值
      // (--i)也在这里烧进标记,运行时靠 CSS 阈值比较(globals.css .scene-cloud;Task 7)。
      const dur = 120 + (cloudIdx % 4) * 45;
      rewritten = `<g class="scene-cloud" `
        + `style="--i:${cloudIdx};animation-duration:${dur}s;animation-delay:-${cloudIdx * 17}s">${rewritten}</g>`;
      cloudIdx += 1;
    }

    if (line.includes('</g>') && stack.length) group = stack.pop()!;
    return rewritten;
  }).join('\n');

  // 无缝循环的前提:图案在 x 方向以画幅宽度为周期。给这两组在右侧各复制一份等宽副本,
  // 整组左移 1832 走完一个周期时,副本正好落到原件的位置,画面逐像素重合。
  const seamless = duplicateForLoop(duplicateForLoop(out, 'water-sparkles'), 'foreground-ripples');

  const svg = seamless.replace(
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
