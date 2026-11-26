import { useCallback, useState } from "react";

/**
 * Deals lists into lanes in board order: list i goes to lane i % count. A list never changes lane
 * while cards move, so drag previews cannot reflow the board.
 */
export function boardLanes<T>(lists: T[], count: number) {
  const lanes = Array.from({ length: Math.min(count, lists.length) }, () => [] as { list: T; index: number }[]);
  lists.forEach((list, index) => lanes[index % lanes.length].push({ list, index }));
  return lanes;
}

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
