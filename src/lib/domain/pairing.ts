import { createHash, randomBytes } from 'node:crypto';

export const PAIR_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 无易混淆字符
export const PAIR_CODE_TTL_MS = 15 * 60 * 1000;

/** 6-char pairing code. `rand` is injectable for deterministic tests (defaults to Math.random). */
export function generatePairCode(rand: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += PAIR_CODE_ALPHABET[Math.floor(rand() * PAIR_CODE_ALPHABET.length)];
  }
  return code;
}

export function pairCodeExpiry(now: Date): Date {
  return new Date(now.getTime() + PAIR_CODE_TTL_MS);
}

/** Expired when now is at or past expiresAt (equality counts as expired). */
export function isPairCodeExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function generateDeviceToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
