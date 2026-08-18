import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { unsealData } from 'iron-session';
import type { ReactNode } from 'react';
import { SESSION_COOKIE, type SessionData } from '@/lib/auth/session';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/agents', label: 'Team' },
  { href: '/admin/listings', label: 'Listings' },
  { href: '/admin/announcements', label: 'Announcements' },
  { href: '/admin/goals', label: 'Goals' },
  { href: '/admin/screens', label: 'Screens' },
  { href: '/admin/settings', label: 'Settings' },
];

async function getSession(): Promise<SessionData | null> {
  const seal = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!seal) return null;
  try {
    const data = await unsealData<SessionData>(seal, {
      password: process.env.SESSION_SECRET!,
    });
    if (!data || typeof data.userId !== 'string' || data.userId.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

async function logout() {
  'use server';
  (await cookies()).set(SESSION_COOKIE, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
  });
  redirect('/admin/login');
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/admin/login');

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-52 shrink-0 flex-col border-r border-panel-2 bg-panel p-4">
        <div className="neon-text mb-6 font-display text-sm text-neon">SALES CHAMPIONS</div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="mt-auto">
          <button
            type="submit"
            className="w-full rounded border border-panel-2 px-3 py-2 text-sm text-muted hover:border-muted hover:text-ink"
          >
            Logout
          </button>
        </form>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
