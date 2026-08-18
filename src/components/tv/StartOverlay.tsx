'use client';

export function StartOverlay({ onStart }: { onStart: () => void }) {
  const handleClick = () => {
    // Unlock first — fullscreen is best-effort only. iOS Safari has no element
    // Fullscreen API, so calling the missing method would throw synchronously
    // and must never block the audio unlock.
    onStart();
    try {
      document.documentElement.requestFullscreen?.()?.catch(() => {});
    } catch {
      /* fullscreen unsupported — nothing to do */
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <button
        onClick={handleClick}
        className="neon-border rounded-2xl border-2 border-neon bg-panel px-16 py-8 font-display text-5xl tracking-[0.2em] text-neon neon-text"
      >
        CLICK TO START
      </button>
    </div>
  );
}

export default StartOverlay;
