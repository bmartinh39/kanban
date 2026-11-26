import { useCallback, useState } from "react";

// Client-only: kept apart from board-lanes.ts, which the assistant route also loads on the server.
/** The number of tracks the grid's CSS auto-fill columns resolve to at its current width. */
export function useLaneCount() {
  const [count, setCount] = useState(1);
  const ref = useCallback((grid: HTMLElement | null) => {
    if (!grid) return;
    const observer = new ResizeObserver(() => setCount(getComputedStyle(grid).gridTemplateColumns.split(" ").length));
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  return [count, ref] as const;
}
