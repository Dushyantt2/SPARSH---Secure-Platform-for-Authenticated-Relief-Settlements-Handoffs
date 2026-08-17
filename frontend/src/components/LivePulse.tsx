import { useEffect, useState } from 'react';

// Small "live sync" pill: green pulsing dot + how recently the dashboard last synced.
export function LivePulse({ syncedAt, label = 'Live sync' }: { syncedAt: number; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const age = Math.max(0, now - syncedAt);
  const ago =
    age < 1500 ? 'just now' : age < 60000 ? `${Math.round(age / 1000)}s ago` : new Date(syncedAt).toLocaleTimeString('en-IN');

  return (
    <div className="chip border border-emerald-300 bg-emerald-50 text-emerald-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {label} · {ago}
    </div>
  );
}
