// Tests need a session secret before any seal/unseal happens.
process.env.SESSION_SECRET ||= 'test-secret-test-secret-test-secret!!';

import { sealSession, SESSION_COOKIE } from '@/lib/auth/session';

export function jsonRequest(url: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Request {
  return new Request(`http://test.local${url}`, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

/** 已登录管理员的请求(自制会话 cookie)。 */
export async function authedRequest(url: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Request> {
  const seal = await sealSession({ userId: 'test-admin', email: 'admin@test.dev' });
  return jsonRequest(url, { ...opts, headers: { ...(opts.headers ?? {}), cookie: `${SESSION_COOKIE}=${seal}` } });
}
