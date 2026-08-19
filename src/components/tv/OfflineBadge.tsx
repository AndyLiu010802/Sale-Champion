'use client';

export function OfflineBadge() {
  return (
    <div className="glass fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-2">
      <span className="h-3 w-3 rounded-full bg-amber-400" />
      <span className="font-heading text-sm tracking-widest text-amber-400">OFFLINE</span>
    </div>
  );
}

export default OfflineBadge;
