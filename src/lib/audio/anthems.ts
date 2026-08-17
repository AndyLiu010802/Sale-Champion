export type BuiltinAnthem = { id: string; name: string }; // id 形如 'builtin:victory'

export const BUILTIN_ANTHEMS: BuiltinAnthem[] = [
  { id: 'builtin:victory', name: 'Victory Fanfare' },
  { id: 'builtin:neon-rush', name: 'Neon Rush' },
  { id: 'builtin:champion', name: 'Champion Rise' },
];

export function isBuiltinAnthem(url: string | null): boolean {
  return url !== null && url.startsWith('builtin:');
}
