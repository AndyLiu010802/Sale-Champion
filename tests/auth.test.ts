import { describe, it, expect, beforeEach, vi } from 'vitest';
import { freshDb, seedBasics } from './helpers/db';
import { jsonRequest, authedRequest } from './helpers/request';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { requireAdmin, sealSession, sessionSetCookie, SESSION_COOKIE } from '@/lib/auth/session';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';
import { GET as healthGet } from '@/app/api/health/route';

describe('password hashing', () => {
  it('hashes and verifies a round-trip', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    const db = await freshDb();
    await seedBasics(db);
  });

  it('returns 200 with { data: { email } } and sets the session cookie', async () => {
    const res = await loginPost(jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@test.dev', password: 'secret123' },
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.email).toBe('admin@test.dev');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Max-Age=1209600');
  });

  it('returns 401 for a wrong password', async () => {
    const res = await loginPost(jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@test.dev', password: 'nope' },
    }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBeTypeOf('string');
  });

  it('returns 401 for an unknown email', async () => {
    const res = await loginPost(jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'ghost@test.dev', password: 'secret123' },
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await loginPost(jsonRequest('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@test.dev' },
    }));
    expect(res.status).toBe(400);
  });
});

describe('requireAdmin', () => {
  it('returns a 401 Response when no cookie is present', async () => {
    const result = await requireAdmin(jsonRequest('/api/anything'));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(await (result as Response).json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns SessionData for a valid session cookie', async () => {
    const req = await authedRequest('/api/anything');
    const result = await requireAdmin(req);
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error('unreachable');
    expect(result).toEqual({ userId: 'test-admin', email: 'admin@test.dev' });
  });

  it('returns a 401 Response for a garbage cookie', async () => {
    const req = jsonRequest('/api/anything', { headers: { cookie: `${SESSION_COOKIE}=garbage-seal` } });
    const result = await requireAdmin(req);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await logoutPost();
    expect(res.status).toBe(200);
    expect((await res.json()).data.ok).toBe(true);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('Max-Age=0');
  });
});

describe('GET /api/health', () => {
  it('returns { ok: true } without a data wrapper', async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('sessionSetCookie', () => {
  it('includes Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(sessionSetCookie('x')).toContain('; Secure');
    } finally {
      vi.unstubAllEnvs();
    }
    expect(sessionSetCookie('x')).not.toContain('; Secure');
  });
});

describe('SESSION_SECRET validation', () => {
  it('rejects a too-short SESSION_SECRET', async () => {
    vi.stubEnv('SESSION_SECRET', 'short');
    try {
      await expect(sealSession({ userId: 'x', email: 'x@test.dev' })).rejects.toThrow(/at least 32/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
