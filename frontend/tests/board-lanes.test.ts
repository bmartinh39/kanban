import { describe, expect, it } from "vitest";
import { initialBoard, type Column } from "../app/board-state";
import { shortestLane, visibleLanes } from "../app/board-lanes";

const ids = (lanes: ReturnType<typeof visibleLanes>) => lanes.map(lane => lane.map(({ list, index }) => `${list.id}@${index}`));
const list = (id: string, lane: number, cards = 0): Column => ({ id, name: id, color: "#79bdf0", lane, cards: Array.from({ length: cards }, (_, index) => ({ id: `${id}-${index}`, title: "Card", details: "" })) });

describe("board lanes (issue #53)", () => {
  it("shows each list in its stored lane, keeping board order within a lane", () => {
    expect(ids(visibleLanes(initialBoard, 3))).toEqual([["ideas@0", "review@3"], ["planned@1", "done@4"], ["progress@2"]]);
  });

  it("folds lanes that do not fit into the visible ones in order, and shows empty lanes", () => {
    const board = [list("a", 2), list("b", 0), list("c", 1), list("d", 0)];
    expect(ids(visibleLanes(board, 2))).toEqual([["b@1", "d@3", "a@0"], ["c@2"]]);
    expect(ids(visibleLanes(board, 1))).toEqual([["b@1", "d@3", "c@2", "a@0"]]);
    expect(ids(visibleLanes(board, 4))).toEqual([["b@1", "d@3"], ["c@2"], ["a@0"], []]);
    expect(visibleLanes([], 3)).toEqual([]);
  });

  it("picks the visible lane with the least content for new lists, leftmost on ties", () => {
    expect(shortestLane(initialBoard, 3)).toBe(2);
    expect(shortestLane([list("a", 0, 1), list("b", 1, 1)], 3)).toBe(2);
    expect(shortestLane([list("a", 0, 1), list("b", 1), list("c", 1)], 2)).toBe(0);
    expect(shortestLane([], 3)).toBe(0);
  });
});
