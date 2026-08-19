'use client';

export function PairingScreen({ pairCode }: { pairCode: string | null }) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-12">
      <h1 className="font-display text-5xl tracking-[0.3em] text-neon neon-text">
        PAIR THIS SCREEN
      </h1>
      {pairCode ? (
        <div className="flex gap-4">
          {pairCode.split('').map((ch, i) => (
            <div
              key={i}
              className="neon-border flex h-40 w-32 items-center justify-center rounded-xl bg-panel/70 font-display text-8xl text-neon neon-text backdrop-blur-sm"
            >
              {ch}
            </div>
          ))}
        </div>
      ) : (
        <div className="font-display text-6xl text-muted">CONNECTING…</div>
      )}
      <p className="font-heading text-2xl text-muted">
        Enter this code in the admin panel → Screens
      </p>
    </div>
  );
}

export default PairingScreen;
