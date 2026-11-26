import { expect, it } from "vitest";
import type { DroppableContainers } from "@dnd-kit/core";
import { columnCoordinates } from "../app/keyboard-coordinates";
import { boardCollisionDetection } from "../app/drag-collision";
import { active, containers, listActive, listContainers, listRects, rect, rectangles } from "./drag-fixtures";

function press(code: string, overId: string, unmeasured?: string) {
  const container = containers.find(item => item.id === overId)!;
  const measured = new Map(rectangles);
  if (unmeasured) measured.delete(unmeasured);
  const overRect = rectangles.get(overId)!;
  return columnCoordinates(new KeyboardEvent("keydown", { code }), {
    active: active.id,
    currentCoordinates: { x: 100, y: 200 },
    context: {
      active,
      activatorEvent: null,
      activeNode: null,
      collisionRect: unmeasured === active.id ? null : rect(overRect.left, overRect.top, 210, 100),
      collisions: null,
      draggableNodes: new Map(),
      draggingNode: null,
      draggingNodeRect: null,
      droppableContainers: { getEnabled: () => containers } as DroppableContainers,
      droppableRects: measured,
      over: { id: container.id, data: container.data, disabled: false, rect: overRect },
      scrollableAncestors: [],
      scrollAdjustedTranslate: null,
    },
  });
}

it.each([
  ["ArrowUp", { x: 100, y: 89 }],
  ["ArrowDown", { x: 100, y: 346 }],
] as const)("selects the adjacent card with %s", (code, expected) => {
  expect(press(code, "c2")).toEqual(expected);
});

it.each([
  ["ArrowUp", "c1"],
  ["ArrowDown", "c3"],
  ["ArrowUp", "c4"],
  ["ArrowDown", "planned"],
  ["ArrowLeft", "c2"],
  ["ArrowRight", "done"],
] as const)("keeps the current coordinates at a boundary (%s over %s)", (code, target) => {
  expect(press(code, target)).toEqual({ x: 100, y: 200 });
});

it.each([
  ["ArrowRight", "c2", { x: 350, y: 150 }],
  ["ArrowLeft", "c4", { x: -150, y: 333.5 }],
] as const)("selects the adjacent column with %s while over %s", (code, target, expected) => {
  expect(press(code, target)).toEqual(expected);
});

it("ignores keys unrelated to movement", () => {
  expect(press("KeyA", "c2")).toBeUndefined();
});

it("moves between a destination card's insertion slot and the append slot", () => {
  expect(press("ArrowDown", "c4")).toEqual({ x: 100, y: 261 });
  expect(press("ArrowUp", "planned")).toEqual({ x: 110, y: 239 });
});

it.each(["c2", "c3"])("waits until both the dragged and target rectangles are measured (%s)", unmeasured => {
  expect(press("ArrowDown", "c2", unmeasured)).toEqual({ x: 100, y: 200 });
});

// Lists (issue #53): each step is checked by where collision detection then aims the moved copy.
function stepList(code: string, overId: string) {
  const base = rect(0, 0, 230, 540);
  const active = listActive("ideas");
  const over = listContainers.find(item => item.id === overId)!;
  const context = {
    active, activatorEvent: null, activeNode: null, collisionRect: base,
    collisions: null, draggableNodes: new Map(), draggingNode: null, draggingNodeRect: null,
    droppableContainers: { getEnabled: () => listContainers } as unknown as DroppableContainers,
    droppableRects: listRects,
    over: { id: over.id, data: over.data, disabled: false, rect: listRects.get(overId)! },
    scrollableAncestors: [], scrollAdjustedTranslate: null,
  };
  const moved = columnCoordinates(new KeyboardEvent("keydown", { code }), { active: active.id, currentCoordinates: { x: 0, y: 0 }, context })!;
  if (moved.x === 0 && moved.y === 0) return "unchanged";
  return boardCollisionDetection({
    active, collisionRect: rect(moved.x, moved.y, 230, 540), droppableContainers: listContainers, droppableRects: listRects, pointerCoordinates: null,
  })[0]?.id;
}

it.each([
  ["ArrowDown", "ideas", "review"],
  ["ArrowDown", "review", "lane:0"],
  ["ArrowDown", "lane:0", "lane:0"],
  ["ArrowUp", "lane:0", "review"],
  ["ArrowUp", "review", "ideas"],
  ["ArrowRight", "ideas", "planned"],
  ["ArrowRight", "review", "done"],
  ["ArrowRight", "lane:0", "lane:1"],
  ["ArrowRight", "done", "lane:2"],
  ["ArrowRight", "progress", "lane:3"],
  ["ArrowLeft", "planned", "ideas"],
  ["ArrowRight", "lane:3", "unchanged"],
] as const)("moves a dragged list with %s from %s to %s", (code, from, expected) => {
  expect(stepList(code, from)).toBe(expected);
});
