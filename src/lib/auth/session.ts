import { sealData, unsealData } from 'iron-session';

export const SESSION_COOKIE = 'tvsaas_session';
export type SessionData = { userId: string; email: string };

const TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET environment variable is required');
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters long');
  return secret;
}

export async function sealSession(data: SessionData): Promise<string> {
  return sealData(data, { password: getSecret(), ttl: TTL_SECONDS });
}

export async function readSessionFromRequest(req: Request): Promise<SessionData | null> {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;
  const pair = cookieHeader.split('; ').find((p) => p.startsWith(`${SESSION_COOKIE}=`));
  if (!pair) return null;
  const seal = pair.slice(SESSION_COOKIE.length + 1);
  if (!seal) return null;
  try {
    const data = await unsealData<SessionData>(seal, { password: getSecret(), ttl: TTL_SECONDS });
    if (typeof data?.userId !== 'string' || typeof data?.email !== 'string') return null;
    return { userId: data.userId, email: data.email };
  } catch {
    return null;
  }
}

export function sessionSetCookie(seal: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${seal}; Path=/; HttpOnly; SameSite=Lax; Max-Age=1209600${secure}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function requireAdmin(req: Request): Promise<SessionData | Response> {
  const session = await readSessionFromRequest(req);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return session;
}
