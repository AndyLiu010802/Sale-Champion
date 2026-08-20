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
