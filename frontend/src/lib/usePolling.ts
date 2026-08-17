import { useCallback, useEffect, useRef, useState } from 'react';

// Re-runs `fn` on mount, every `intervalMs`, and whenever the tab regains focus.
// Returns the timestamp of the last successful sync so pages can render a live indicator.
export function usePolling(fn: () => void | Promise<void>, intervalMs = 4000): number {
  const cbRef = useRef(fn);
  cbRef.current = fn;
  const [lastSync, setLastSync] = useState<number>(() => Date.now());

  const run = useCallback(async () => {
    try {
      await cbRef.current();
      setLastSync(Date.now());
    } catch {
      // keep the previous sync time; a later poll will recover
    }
  }, []);

  useEffect(() => {
    void run();
    const id = setInterval(() => void run(), intervalMs);
    const onFocus = () => void run();
    const onVis = () => {
      if (!document.hidden) void run();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs, run]);

  return lastSync;
}
