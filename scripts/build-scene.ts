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

/** 起伏曲线名册(定义在 globals.css)。逐元素随机挑一条:只随机周期的话,每条线自己
 *  仍旧是等间隔脉动,盯久了就是节拍器。名字改了这里和 CSS 要一起改。 */
const SPARKLE_CURVES = ['scene-shimmer-1', 'scene-shimmer-2', 'scene-shimmer-3', 'scene-shimmer-4'];
const RIPPLE_CURVES = ['scene-undulate-1', 'scene-undulate-2'];

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
 * 水面"波光粼粼":线条不移动,只让每条线各自明暗起伏(需求方 2026-08-21 定稿——碎光是
 * 横条,沿自身长轴平移几乎不产生运动线索,读出来是原地抖动而不是水流)。
 *
 * 每条线烧进三个值:--o 是原画给它的 opacity,**必须**由它来当动画基准 —— CSS 动画的
 * opacity 层叠优先级高于 SVG 的 opacity 表现属性,keyframes 里写死数值会把原画
 * 0.16–0.54 的明暗层次整体压平成一个值(整片齐闪的一半原因);另外两个是各自随机的
 * 周期与负相位,集体节拍消失,看起来才是一片零散的碎光。opacity 属性原样留着,
 * 当 CSS 没生效时的回落。
 */
function shimmer(line: string, tag: string, cls: string, names: string[],
                 rand: () => number, minDur: number, maxDur: number): string {
  const op = /opacity="([\d.]+)"/.exec(line);
  if (!op) throw new Error(`shimmer: ${cls} 少了 opacity 基准 —— ${line.trim().slice(0, 80)}`);
  const name = names[Math.floor(rand() * names.length)];
  const dur = minDur + rand() * (maxDur - minDur);
  const delay = rand() * dur;      // 负相位铺满整个周期,谁都不和谁同时起步
  return line.replace(tag, `${tag.trim()} class="${cls}" style="--o:${op[1]};`
    + `animation-name:${name};animation-duration:${dur.toFixed(2)}s;`
    + `animation-delay:-${delay.toFixed(2)}s" `);
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
  // 水面起伏的周期/相位逐元素随机(固定种子 → 构建产物可重现)。碎光与波纹各走一条流:
  // 往任一组加减元素都不会扰动另一组已经烧好的参数。
  const sparkleRand = mulberry32(9101);
  const rippleRand = mulberry32(9102);
  let sparkleCount = 0;
  let rippleCount = 0;

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
      // 碎光:"粼粼"的主体。周期 8–18s —— 早先 2.4–6.4s 每条线四秒一个来回,读出来是
      // 疯狂闪烁而不是水光(需求方目验)。慢下来之后单次起伏本身要好几秒,才像水。
      rewritten = shimmer(rewritten, '<rect ', 'scene-sparkle', SPARKLE_CURVES,
        sparkleRand, 8, 18);
      sparkleCount += 1;
    } else if (group === 'foreground-ripples' && line.trimStart().startsWith('<path')) {
      // 前景长波纹:整条一起变,快闪会显得整片在跳,所以幅度更浅、周期更长(16–32s)。
      rewritten = shimmer(rewritten, '<path ', 'scene-ripple', RIPPLE_CURVES,
        rippleRand, 16, 32);
      rippleCount += 1;
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

  const svg = out.replace(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1832" height="859" viewBox="0 0 1832 859" fill="none">',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1832 859" fill="none" '
    + 'preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block">');
  console.log(`[build-scene] ${sparkleCount} sparkles + ${rippleCount} ripples shimmering`);
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
