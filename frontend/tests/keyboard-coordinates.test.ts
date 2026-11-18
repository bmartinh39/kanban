import { expect, it } from "vitest";
import type { DroppableContainers } from "@dnd-kit/core";
import { columnCoordinates } from "../app/keyboard-coordinates";
import { active, containers, rect, rectangles } from "./drag-fixtures";

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
  ["ArrowDown", "c4"],
  ["ArrowLeft", "c2"],
  ["ArrowRight", "done"],
] as const)("keeps the current coordinates at a boundary (%s over %s)", (code, target) => {
  expect(press(code, target)).toEqual({ x: 100, y: 200 });
});

it.each([
  ["ArrowRight", "c2", { x: 350, y: 45 }],
  ["ArrowLeft", "c4", { x: -150, y: 333.5 }],
] as const)("selects the adjacent column with %s while over %s", (code, target, expected) => {
  expect(press(code, target)).toEqual(expected);
});

it("ignores keys unrelated to movement", () => {
  expect(press("KeyA", "c2")).toBeUndefined();
});

it.each(["c2", "c3"])("waits until both the dragged and target rectangles are measured (%s)", unmeasured => {
  expect(press("ArrowDown", "c2", unmeasured)).toEqual({ x: 100, y: 200 });
});
