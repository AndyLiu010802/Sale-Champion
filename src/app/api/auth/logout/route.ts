import { sessionClearCookie } from '@/lib/auth/session';

export async function POST() {
  return Response.json(
    { data: { ok: true } },
    { headers: { 'set-cookie': sessionClearCookie() } },
  );
}
