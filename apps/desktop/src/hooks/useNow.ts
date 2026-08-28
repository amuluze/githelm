import { useEffect, useState } from "react";

/**
 * A "now" that ticks on an interval: react/purity forbids `new Date()`
 * during render, and relative-time labels ("3 分钟前") must advance without
 * waiting for a data change to happen to re-render the rows.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
