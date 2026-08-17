import { createHash, randomBytes, randomInt } from 'node:crypto';

export const PAIR_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 无易混淆字符
export const PAIR_CODE_TTL_MS = 15 * 60 * 1000;

/**
 * 6-char pairing code. Default path uses a CSPRNG (node:crypto randomInt).
 * `rand` is injectable for deterministic tests; its output is clamped to the
 * alphabet's upper bound so rand() === 1 cannot index out of range.
 */
export function generatePairCode(rand?: () => number): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    const idx = rand
      ? Math.min(PAIR_CODE_ALPHABET.length - 1, Math.floor(rand() * PAIR_CODE_ALPHABET.length))
      : randomInt(0, PAIR_CODE_ALPHABET.length);
    code += PAIR_CODE_ALPHABET[idx];
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
