import { describe, expect, it } from "vitest";
import { boardLanes } from "../app/board-lanes";

describe("boardLanes", () => {
  it("deals lists into lanes in board order", () => {
    expect(boardLanes(["a", "b", "c", "d", "e"], 3).map(lane => lane.map(({ list, index }) => `${list}${index}`)))
      .toEqual([["a0", "d3"], ["b1", "e4"], ["c2"]]);
  });

  it("uses no more lanes than there are lists", () => {
    expect(boardLanes(["a", "b"], 4)).toHaveLength(2);
    expect(boardLanes([], 4)).toEqual([]);
  });
});
