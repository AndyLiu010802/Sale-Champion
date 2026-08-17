'use client';

export function StartOverlay({ onStart }: { onStart: () => void }) {
  const handleClick = () => {
    document.documentElement.requestFullscreen().catch(() => {});
    onStart();
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
