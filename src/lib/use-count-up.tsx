import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Animate a numeric value from its previous rendered value to `target`.
 * Re-triggers whenever `target` changes (e.g. when filters change).
 */
export function useCountUp(target: number, duration = 900, delay = 0): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prefersReduced()) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;

    const start = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - p, 3);
        const v = from + (target - from) * eased;
        setValue(v);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          fromRef.current = target;
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if (delay > 0) {
      timeoutRef.current = setTimeout(start, delay);
    } else {
      start();
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    };
  }, [target, duration, delay]);

  return value;
}

/**
 * Render a number animated from previous to `value`.
 * Re-triggers whenever `value` changes.
 */
export function AnimatedNumber({
  value,
  format,
  duration = 900,
  delay = 0,
}: {
  value: number;
  format: (n: number) => string | ReactElement;
  duration?: number;
  delay?: number;
}) {
  const v = useCountUp(value, duration, delay);
  return <>{format(v)}</>;
}
