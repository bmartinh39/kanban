import type { Column } from "./board-state";

/** The visible lane a list shows in: stored lanes beyond the screen's lanes fold in, in order (issue #53). */
export const visibleLane = (list: Column, count: number) => list.lane % count;

/**
 * The lists of each visible lane, top to bottom: by stored lane, then board order. Every visible lane is
 * returned, empty ones too, so lists can be dropped into them.
 */
export function visibleLanes(board: Column[], count: number) {
  if (!board.length) return [];
  const entries = board.map((list, index) => ({ list, index }));
  return Array.from({ length: count }, (_, lane) => entries
    .filter(({ list }) => visibleLane(list, count) === lane)
    .toSorted((first, second) => first.list.lane - second.list.lane || first.index - second.index));
}

/** The visible lane with the least content (a list counts as two cards), leftmost on ties; new lists go here. */
export function shortestLane(board: Column[], count: number) {
  const sizes = Array.from({ length: count }, () => 0);
  for (const list of board) sizes[visibleLane(list, count)] += 2 + list.cards.length;
  return sizes.indexOf(Math.min(...sizes));
}
