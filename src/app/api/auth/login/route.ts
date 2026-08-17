import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { sealSession, sessionSetCookie } from '@/lib/auth/session';

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

// Valid bcrypt hash of an arbitrary string, used to run verifyPassword() even when the
// email is unknown — this equalizes timing so a wrong-password vs unknown-email response
// can't be distinguished by how long the request took (no user enumeration via timing).
const DUMMY_HASH = '$2b$10$WLqaTUSpBREwl/N.AFkJSecBlm/tICS/yPmaW42KeDT.YrrG1q91.';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'email and password are required' }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const db = await getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const seal = await sealSession({ userId: user.id, email: user.email });
  return Response.json(
    { data: { email: user.email } },
    { status: 200, headers: { 'set-cookie': sessionSetCookie(seal) } },
  );
}
