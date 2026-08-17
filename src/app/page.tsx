import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-12">
      <h1 className="neon-text text-center font-display text-5xl tracking-widest text-neon">
        SALES CHAMPIONS TV
      </h1>
      <div className="flex gap-8">
        <Link
          href="/tv"
          className="neon-border rounded-xl bg-panel px-10 py-5 font-heading text-2xl text-neon transition hover:bg-panel-2"
        >
          TV DISPLAY
        </Link>
        <Link
          href="/admin"
          className="rounded-xl border border-neon-purple bg-panel px-10 py-5 font-heading text-2xl text-neon-purple transition hover:bg-panel-2"
        >
          ADMIN
        </Link>
      </div>
    </main>
  );
}
