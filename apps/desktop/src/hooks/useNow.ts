import { useState } from "react";

/**
 * A render-stable "now": react/purity forbids `new Date()` during render,
 * and a frozen timestamp per mount is what the relative-time labels want
 * anyway (they refresh on data changes, which remount/re-render the rows).
 */
export function useNow(): Date {
  const [now] = useState(() => new Date());
  return now;
}
