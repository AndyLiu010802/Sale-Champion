import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth/password';
import { sealSession, sessionSetCookie } from '@/lib/auth/session';

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

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
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const seal = await sealSession({ userId: user.id, email: user.email });
  return Response.json(
    { data: { email: user.email } },
    { status: 200, headers: { 'set-cookie': sessionSetCookie(seal) } },
  );
}
