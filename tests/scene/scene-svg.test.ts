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
});
