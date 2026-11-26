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

// Lists (issue #53): ideas, planned and done lead three lanes; review sits below ideas in the first lane.
function pressList(code: string, overId: string) {
  const lists = [...containers.filter(item => item.data.current?.type === "column"), {
    ...containers[0], id: "review", key: "review", data: { current: { type: "column", columnId: "review", index: 3 } }, rect: { current: rect(0, 560, 230, 300) },
  }];
  const rects = new Map([...rectangles, ["review", rect(0, 560, 230, 300)]]);
  const list = { id: "list:ideas", data: { current: { type: "list", listId: "ideas", index: 0 } }, rect: { current: { initial: rects.get("ideas")!, translated: null } } };
  const over = lists.find(item => item.id === overId)!;
  const overRect = rects.get(overId)!;
  return columnCoordinates(new KeyboardEvent("keydown", { code }), {
    active: list.id,
    currentCoordinates: { x: overRect.left, y: overRect.top },
    context: {
      active: list, activatorEvent: null, activeNode: null,
      collisionRect: rect(overRect.left, overRect.top, 230, 540),
      collisions: null, draggableNodes: new Map(), draggingNode: null, draggingNodeRect: null,
      droppableContainers: { getEnabled: () => lists } as unknown as DroppableContainers,
      droppableRects: rects,
      over: { id: over.id, data: over.data, disabled: false, rect: overRect },
      scrollableAncestors: [], scrollAdjustedTranslate: null,
    },
  });
}

it.each([
  ["ArrowRight", "ideas", { x: 250, y: 0 }],
  ["ArrowLeft", "planned", { x: 0, y: 0 }],
  ["ArrowRight", "done", { x: 0, y: 560 }],
  ["ArrowDown", "ideas", { x: 0, y: 560 }],
  ["ArrowUp", "review", { x: 0, y: 0 }],
  ["ArrowUp", "ideas", { x: 0, y: 0 }],
  ["ArrowDown", "planned", { x: 250, y: 0 }],
  ["ArrowLeft", "ideas", { x: 0, y: 0 }],
] as const)("moves a list with %s from %s along the order or within its lane", (code, from, expected) => {
  expect(pressList(code, from)).toEqual(expected);
});
