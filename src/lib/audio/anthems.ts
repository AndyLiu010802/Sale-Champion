export type BuiltinAnthem = { id: string; name: string }; // id 形如 'builtin:victory'

export const BUILTIN_ANTHEMS: BuiltinAnthem[] = [
  { id: 'builtin:victory', name: 'Victory Fanfare' },
  { id: 'builtin:neon-rush', name: 'Neon Rush' },
  { id: 'builtin:champion', name: 'Champion Rise' },
];

// 生日播报专用——刻意不放进 BUILTIN_ANTHEMS,主题曲下拉永远不出现它(设计 §4)。
export const BIRTHDAY_ANTHEM_ID = 'builtin:birthday';

export function isBuiltinAnthem(url: string | null): boolean {
  return url !== null && url.startsWith('builtin:');
}
