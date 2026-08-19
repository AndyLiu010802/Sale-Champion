// SplitFlapTitle 的纯逻辑(视觉设计 §2):翻转序列生成,组件与单测共用。
// rng 显式注入([0,1) 均匀随机):组件传 Math.random,单测传固定种子伪随机钉死输出。

export const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type Rng = () => number;

/** FLAP_CHARS 里均匀取一个字符。 */
export function randomFlapChar(rng: Rng): string {
  return FLAP_CHARS[Math.floor(rng() * FLAP_CHARS.length) % FLAP_CHARS.length];
}

/** 顺延到下一个字母(Z 回绕 A):确定性避开禁用字符,不额外消耗 rng。 */
function nextChar(ch: string): string {
  return FLAP_CHARS[(FLAP_CHARS.indexOf(ch) + 1) % FLAP_CHARS.length];
}

/**
 * 一块翻牌的完整翻转序列:3–6 个随机中间字母 + 末位 targetChar(视觉设计 §2)。
 * 约束:相邻两格不同、中间字母不等于 targetChar(避免"停定又翻走"的观感)。
 * targetChar 不在 A–Z 时(理论上不会发生)序列只含 targetChar。
 */
export function flapSequence(targetChar: string, rng: Rng): string[] {
  if (!FLAP_CHARS.includes(targetChar)) return [targetChar];
  const spins = 3 + Math.floor(rng() * 4); // 3..6
  const seq: string[] = [];
  let prev = '';
  for (let i = 0; i < spins; i++) {
    let ch = randomFlapChar(rng);
    while (ch === prev || ch === targetChar) ch = nextChar(ch);
    seq.push(ch);
    prev = ch;
  }
  seq.push(targetChar);
  return seq;
}
