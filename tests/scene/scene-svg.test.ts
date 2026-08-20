import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SCENE_SLOTS, SCENE_SVG } from '@/lib/scene/sceneSvg';

const GROUPS = [
  'sky', 'sky-clouds', 'mountains', 'mountain-contours', 'mountain-contour-lines',
  'hillside-houses', 'water', 'water-sparkles', 'city', 'tasman-bridge',
  'reflections', 'sailboat', 'foreground-ripples',
];

describe('sceneSvg build output', () => {
  it('keeps every addressable group from the artwork', () => {
    for (const g of GROUPS) expect(SCENE_SVG).toContain(`<g id="${g}"`);
  });

  it('leaves no literal hex colour behind — every fill/stroke is a slot variable', () => {
    expect(SCENE_SVG).not.toMatch(/(fill|stroke|stop-color)="#[0-9A-Fa-f]{6}"/);
    expect(SCENE_SVG).toMatch(/fill="var\(--s\d+\)"/);
  });

  it('every slot referenced by the svg is declared, and every declared slot is used', () => {
    const used = new Set(Array.from(SCENE_SVG.matchAll(/var\(--(s\d+)\)/g), (m) => m[1]));
    const declared = new Set(SCENE_SLOTS.map((s) => s.id));
    expect([...used].filter((id) => !declared.has(id))).toEqual([]);
    expect([...declared].filter((id) => !used.has(id))).toEqual([]);
  });

  it('assigns every slot to a real group and a luminance in 0..1', () => {
    for (const s of SCENE_SLOTS) {
      expect(GROUPS).toContain(s.group);
      expect(s.lum).toBeGreaterThanOrEqual(0);
      expect(s.lum).toBeLessThanOrEqual(1);
    }
  });

  it('never merges colours from different groups into one slot', () => {
    const byId = new Map<string, string>();
    for (const s of SCENE_SLOTS) {
      expect(byId.get(s.id) ?? s.group).toBe(s.group);
      byId.set(s.id, s.group);
    }
    expect(byId.size).toBe(SCENE_SLOTS.length);
  });

  it('is in sync with public/scene/hobart.svg — the element count matches', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'public', 'scene', 'hobart.svg'), 'utf8');
    const count = (s: string) => (s.match(/<(rect|path|circle|line)\b/g) ?? []).length;
    expect(count(SCENE_SVG)).toBe(count(src));
  });

  it('drives lamps and clouds from thresholds baked into the markup, not data- attributes (Task 7)', () => {
    // 逐元素 querySelectorAll + inline display 会在任何一次 innerHTML 重新赋值后静默失效
    // (Task 7 诊断)。改法是把阈值写进 CSS 自定义属性,标记里不该再留 data-t/data-i。
    expect(SCENE_SVG).not.toMatch(/data-t=|data-i=/);

    const lampCount = (SCENE_SVG.match(/class="scene-lamp"/g) ?? []).length;
    const lampWithThreshold = (SCENE_SVG.match(/class="scene-lamp" style="--t:\d+\.\d+"/g) ?? []).length;
    expect(lampCount).toBeGreaterThan(0);
    expect(lampWithThreshold).toBe(lampCount);

    const cloudCount = (SCENE_SVG.match(/class="scene-cloud"/g) ?? []).length;
    const cloudWithIndex = (SCENE_SVG.match(/class="scene-cloud" style="--i:\d+;/g) ?? []).length;
    expect(cloudCount).toBeGreaterThan(0);
    expect(cloudWithIndex).toBe(cloudCount);
  });

  it('adds #stars (140 stars) and #celestial between #sky and #sky-clouds, so clouds occlude both', () => {
    const skyIdx = SCENE_SVG.indexOf('<g id="sky">');
    const skyCloudsIdx = SCENE_SVG.indexOf('<g id="sky-clouds">');
    const starsIdx = SCENE_SVG.indexOf('<g id="stars">');
    const celestialIdx = SCENE_SVG.indexOf('<g id="celestial">');
    expect(skyIdx).toBeGreaterThanOrEqual(0);
    expect(skyCloudsIdx).toBeGreaterThan(skyIdx);
    expect(starsIdx).toBeGreaterThan(skyIdx);
    expect(starsIdx).toBeLessThan(skyCloudsIdx);
    expect(celestialIdx).toBeGreaterThan(skyIdx);
    expect(celestialIdx).toBeLessThan(skyCloudsIdx);

    const starsBlock = SCENE_SVG.slice(starsIdx, SCENE_SVG.indexOf('</g>', starsIdx));
    const starCount = (starsBlock.match(/<circle\b/g) ?? []).length;
    expect(starCount).toBe(140);

    const celestialBlock = SCENE_SVG.slice(celestialIdx, SCENE_SVG.indexOf('</g>', celestialIdx));
    expect(celestialBlock).toContain('class="scene-celestial-glow"');
    expect(celestialBlock).toContain('class="scene-celestial-body"');
    // 两个圆的坐标必须留在 0,靠 #celestial 的 CSS transform 定位——SVG 几何属性不吃
    // var(),cx/cy 写成变量会静默不生效(build-scene.ts 顶部注释,与灯位阈值是同一类坑)。
    expect(celestialBlock).toMatch(/<circle[^>]*cx="0"[^>]*cy="0"/g);
  });

  it('does not route stars/celestial colour through the numbered slot system', () => {
    // 星星与日月只有 1–2 个语义色,硬套色槽的组内亮度归一化没意义(见 build-scene.ts
    // NON_SLOT_GROUPS 注释)——它们该用固定、非编号的 CSS 变量,不该出现在 SCENE_SLOTS。
    expect(SCENE_SLOTS.some((s) => s.group === 'stars' || s.group === 'celestial')).toBe(false);
    expect(SCENE_SVG).toMatch(/fill="var\(--star-color, #[0-9A-Fa-f]{6}\)"/);
    expect(SCENE_SVG).toContain('fill="var(--celestial-glow, ');
    expect(SCENE_SVG).toContain('fill="var(--celestial-body, ');
  });

  it('splits water-sparkles into (at least) four staggered animation-delay phases', () => {
    // 之前 water-sparkles 整组共用一个动画,全场碎光同步呼吸/漂移(§5 要求拆 4 组错开)。
    const delays = new Set(
      Array.from(SCENE_SVG.matchAll(/class="scene-sparkle" style="animation-delay:(-[\d.]+s,-[\d.]+s)"/g),
        (m) => m[1]),
    );
    expect(delays.size).toBeGreaterThanOrEqual(4);
  });

  it('lights an exact number of lamps at each schedule level, not a seed lottery', () => {
    // 阈值是分层的(名次/总数),不是各自独立随机 —— 所以点亮数恒为 floor(lit x N)。
    // Task 7 交付时用的是独立随机:254 个阈值里最小的 0.0091 高于 DAY_BASE 0.0075,
    // 白天一盏都不亮,设计要的"零星两三盏"整个落空,而且全部测试照样绿。
    const ts = Array.from(
      SCENE_SVG.matchAll(/class="scene-lamp" style="--t:([\d.]+)"/g), (m) => Number(m[1]));
    expect(ts).toHaveLength(254);
    const litAt = (lit: number) => ts.filter((t) => t < lit).length;
    expect(litAt(0.0075)).toBe(2);   // DAY_BASE,windowLights.ts
    expect(litAt(0.92)).toBe(234);   // NIGHT_PEAK
    expect(litAt(0)).toBe(0);        // 23:00–05:00 全黑
  });

  it('attributes a slot to the innermost enclosing group, not an outer one', () => {
    // 美术稿里 mountains 嵌套着 mountain-contours 与 mountain-contour-lines(两层)。
    // 构建脚本用栈跟踪归属,所以内层胜出;如果谁把栈简化成单变量(相信"分组是平的"),
    // 内层元素会被记到 mountains 名下,而聚合数量类的断言查不出来。这条逐引用核对。
    const byId = new Map(SCENE_SLOTS.map((s) => [s.id, s.group]));
    const stack: (string | null)[] = [];
    let group: string | null = null;   // 进入第一个 <g> 之前不属于任何分组
    let inDefs = false;
    let checked = 0;
    for (const line of SCENE_SVG.split('\n')) {
      if (line.includes('<defs>')) inDefs = true;
      const gm = /<g id="([^"]+)"/.exec(line);
      if (gm) { stack.push(group); group = gm[1]; }
      // <defs> 里的渐变按 id 前缀归组,不受 <g> 栈管辖,跳过。
      if (!inDefs && group) {
        for (const m of line.matchAll(/var\(--(s\d+)\)/g)) {
          expect(byId.get(m[1])).toBe(group);
          checked += 1;
        }
      }
      if (line.includes('</defs>')) inDefs = false;
      if (line.includes('</g>') && stack.length) group = stack.pop() ?? null;
    }
    expect(checked).toBeGreaterThan(800); // 确实走过了整幅画,不是空转
  });

  it('keeps the nested mountain groups addressable in their own right', () => {
    for (const g of ['mountain-contours', 'mountain-contour-lines']) {
      expect(SCENE_SLOTS.filter((s) => s.group === g).length).toBeGreaterThan(0);
    }
  });
});
