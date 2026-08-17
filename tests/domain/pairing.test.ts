import { describe, it, expect } from 'vitest';
import {
  PAIR_CODE_ALPHABET,
  PAIR_CODE_TTL_MS,
  generatePairCode,
  pairCodeExpiry,
  isPairCodeExpired,
  generateDeviceToken,
  hashToken,
} from '@/lib/domain/pairing';

describe('generatePairCode', () => {
  it('is 6 chars, all from the confusion-free alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(PAIR_CODE_ALPHABET).toContain(ch);
    }
  });

  it('is deterministic with an injected rand', () => {
    expect(generatePairCode(() => 0)).toBe('222222');
    // alphabet has 31 chars: floor(0*31)=0→'2', floor(0.5*31)=15→'H', floor(0.999*31)=30→'Z'
    const values = [0, 0.5, 0.999, 0, 0.5, 0.999];
    let i = 0;
    expect(generatePairCode(() => values[i++])).toBe('2HZ2HZ');
  });

  it('clamps injected rand at the upper bound', () => {
    const code = generatePairCode(() => 1);
    expect(code).toHaveLength(6);
    for (const ch of code) expect(PAIR_CODE_ALPHABET).toContain(ch);
    expect(code).toBe('ZZZZZZ');
  });
});

describe('pairCodeExpiry', () => {
  it('adds exactly 15 minutes', () => {
    expect(PAIR_CODE_TTL_MS).toBe(15 * 60 * 1000);
    const now = new Date(2026, 7, 17, 10, 0, 0);
    expect(pairCodeExpiry(now).getTime()).toBe(now.getTime() + 15 * 60 * 1000);
  });
});

describe('isPairCodeExpired', () => {
  const expiresAt = new Date(2026, 7, 17, 10, 15, 0);

  it('false strictly before expiry', () => {
    expect(isPairCodeExpired(expiresAt, new Date(2026, 7, 17, 10, 14, 59, 999))).toBe(false);
  });

  it('true exactly at expiresAt', () => {
    expect(isPairCodeExpired(expiresAt, new Date(expiresAt.getTime()))).toBe(true);
  });

  it('true after expiry', () => {
    expect(isPairCodeExpired(expiresAt, new Date(2026, 7, 17, 10, 15, 1))).toBe(true);
  });
});

describe('device tokens', () => {
  it('generateDeviceToken returns 64 lowercase hex chars, unique per call', () => {
    const t1 = generateDeviceToken();
    const t2 = generateDeviceToken();
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    expect(t2).toMatch(/^[0-9a-f]{64}$/);
    expect(t1).not.toBe(t2);
  });

  it('hashToken is stable sha256 hex, different inputs differ', () => {
    // well-known sha256 test vector for 'abc'
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abd')).not.toBe(hashToken('abc'));
    expect(hashToken('abd')).toMatch(/^[0-9a-f]{64}$/);
  });
});
