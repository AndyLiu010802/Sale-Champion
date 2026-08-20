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

  it('is in sync with public/scene/hobart.svg — every element survives, one for one', () => {
    // 水面不再横向漂移(需求方 2026-08-21 定稿:线条不动,只让明暗随机起伏),无缝循环的
    // 前提也就没有了,构建期不再复制"右移一个画幅"的副本 —— 产物与原稿必须逐个对齐。
    const src = fs.readFileSync(path.join(process.cwd(), 'public', 'scene', 'hobart.svg'), 'utf8');
    const count = (str: string) => (str.match(/<(rect|path|circle|line)\b/g) ?? []).length;
    expect(count(SCENE_SVG)).toBe(count(src));
  });

  it('leaves no horizontal drift on the water', () => {
    // 碎光是横条,沿自身长轴平移几乎不产生运动线索:平移读不出流向,只看得见明暗在跳
    // (需求方目验)。keyframes、整组平移、右移副本三者一并删除,别再单独复活其中一个。
    expect(SCENE_SVG).not.toContain('translate(1832,0)');
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    expect(css).not.toContain('scene-flow-left');
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

  it('shimmers every water line on its own curve, period and phase', () => {
    // 波光粼粼 = 每条线各自起伏,而且它自己的节拍也不能规整。只随机周期不够:一条线仍旧是
    // 等间隔脉动,盯久了就是节拍器(需求方目验:"水波不是疯狂固定频率闪烁的")。所以曲线
    // 形状也逐条随机挑,四条曲线的闪法各不相同。
    const shimmer = Array.from(SCENE_SVG.matchAll(
      /class="scene-(sparkle|ripple)" style="--o:[\d.]+;animation-name:(scene-[a-z]+-\d);animation-duration:([\d.]+)s;animation-delay:(-[\d.]+)s"/g,
    ));
    const sparkles = shimmer.filter((m) => m[1] === 'sparkle');
    const ripples = shimmer.filter((m) => m[1] === 'ripple');
    expect(sparkles).toHaveLength(323);
    expect(ripples).toHaveLength(12);
    // 四条碎光曲线、两条波纹曲线都得真的用上,否则等于白定义。
    expect(new Set(sparkles.map((m) => m[2])).size).toBe(4);
    expect(new Set(ripples.map((m) => m[2])).size).toBe(2);
    // 曲线+周期+相位的组合几乎不该撞车,撞多了就能看出节拍。
    expect(new Set(sparkles.map((m) => m.slice(2, 5).join('|'))).size).toBeGreaterThan(310);
    // 相位一律为负:正延迟等于全体在 t=0 一起起步,开头几秒会同步闪。
    expect(SCENE_SVG).not.toMatch(/class="scene-(?:sparkle|ripple)"[^>]*animation-delay:[^-]/);
  });

  it('keeps the water slow — one swell takes seconds, not a strobe', () => {
    // 早先碎光 2.4–6.4s 一个来回,读出来是疯狂闪烁(需求方目验)。这条把区间钉死:调快
    // 之前先想清楚,单次起伏只占周期的一小段,周期短了立刻回到频闪。
    // 一条正则取全部,不用 new RegExp:模板字符串里的 [\d.] 会被 JS 当成无效转义吃成 [d.],
    // 正则匹配不到任何东西,而 Math.min(...[]) 是 Infinity、Math.max(...[]) 是 -Infinity,
    // 下面四条断言会全部静默通过 —— 这条测试写第一版时就是这么空跑绿的。
    const rows = Array.from(SCENE_SVG.matchAll(
      /class="scene-(sparkle|ripple)"[^>]*animation-duration:([\d.]+)s/g));
    const durs = (cls: string) => rows.filter((m) => m[1] === cls).map((m) => Number(m[2]));
    const sparkle = durs('sparkle');
    const ripple = durs('ripple');
    expect(sparkle).toHaveLength(323);   // 先钉数量,空数组过不去
    expect(ripple).toHaveLength(12);
    expect(Math.min(...sparkle)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...sparkle)).toBeLessThanOrEqual(18);
    expect(Math.min(...ripple)).toBeGreaterThanOrEqual(16);
    expect(Math.max(...ripple)).toBeLessThanOrEqual(32);
  });

  it('declares every curve the markup asks for', () => {
    // 曲线名在构建脚本与 globals.css 两处,改一处漏一处的话动画会静默不跑(名字对不上
    // 的 animation-name 不报错,元素就停在原画的 opacity 上)。
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    const used = new Set(Array.from(SCENE_SVG.matchAll(/animation-name:(scene-[a-z-]+\d)/g), (m) => m[1]));
    expect(used.size).toBe(6);
    for (const name of used) expect(css).toContain(`@keyframes ${name} `);
  });

  it('hands each line its painted opacity as --o instead of hard-coding one value', () => {
    // CSS 动画的 opacity 层叠优先级高于 SVG 的 opacity 表现属性 —— 早先 keyframes 写死
    // .55→1,把原画 0.16–0.54 的明暗层次整体压平并提亮成同一个值,这是"齐闪"的另一半原因。
    // 基准亮度必须逐元素交给动画(--o),且与元素保留的 opacity 属性(CSS 失效时的回落)一致。
    const rows = Array.from(SCENE_SVG.matchAll(
      /class="scene-(?:sparkle|ripple)" style="--o:([\d.]+);[^"]*"[^>]*opacity="([\d.]+)"/g));
    expect(rows).toHaveLength(335);
    for (const [, o, attr] of rows) expect(o).toBe(attr);
    expect(new Set(rows.map((m) => m[1])).size).toBeGreaterThan(30);
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
