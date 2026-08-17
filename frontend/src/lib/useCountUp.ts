import { useEffect, useRef, useState } from 'react';

// Animate a number from 0 (or `from`) to `target` using an ease-out cubic curve.
// Returns the live value so callers can format it (₹, %, decimals) as they wish.
export function useCountUp(target: number, duration = 900, from = 0): number {
  const [value, setValue] = useState(from);
  const raf = useRef<number>(0);
  const fromRef = useRef(from);
  fromRef.current = from;

  useEffect(() => {
    const start = performance.now();
    const startVal = fromRef.current;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(startVal + (target - startVal) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return value;
}
