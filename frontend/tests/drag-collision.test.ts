import { expect, it } from "vitest";
import type { ClientRect, CollisionDetection } from "@dnd-kit/core";
import { boardCollisionDetection } from "../app/drag-collision";
import { active, containers, listActive, listContainers, listRects, rect, rectangles } from "./drag-fixtures";

function targetAt(x: number, y: number, pointer = true, viewport?: ClientRect, frame?: ClientRect) {
  const args: Parameters<CollisionDetection>[0] = {
    active,
    collisionRect: rect(x - 105, y - 50, 210, 100),
    droppableContainers: containers,
    droppableRects: rectangles,
    pointerCoordinates: pointer ? { x, y } : null,
  };
  return boardCollisionDetection(args, viewport, frame)[0]?.id;
}

it("prefers the source card to its parent column", () => {
  expect(targetAt(115, 248)).toBe("c2");
});

it("targets the last source card in the column space below the stack", () => {
  expect(targetAt(115, 480)).toBe("c3");
});

it("targets the next insertion card above its midpoint and appends below the last midpoint", () => {
  expect(targetAt(365, 64)).toBe("c4");
  expect(targetAt(365, 113)).toBe("c4");
  expect(targetAt(365, 114)).toBe("planned");
  expect(targetAt(365, 480)).toBe("planned");
});

it("targets an empty destination column for append", () => {
  expect(targetAt(615, 114)).toBe("done");
});

it("selects middle and final insertion slots in layout order after cards were reordered", () => {
  const first = containers.find(container => container.id === "c4")!;
  const second = { ...first, id: "c5", key: "c5", data: { current: {
    type: "card", columnId: "planned", sortable: { containerId: "planned", index: 1, items: ["c4", "c5"] },
  } } };
  const measured = new Map(rectangles).set("c5", rect(260, 175, 210, 145));
  const target = (y: number) => boardCollisionDetection({
    active, pointerCoordinates: { x: 365, y }, collisionRect: rect(260, y - 50, 210, 100),
    droppableContainers: [second, ...containers], droppableRects: measured,
  })[0]?.id;
  expect(target(80)).toBe("c4");
  expect(target(130)).toBe("c5");
  expect(target(246)).toBe("c5");
  expect(target(248)).toBe("planned");
});

it("returns no target when the pointer leaves the board while the overlay overlaps it", () => {
  expect(targetAt(740, 114)).toBeUndefined();
});

it("uses the overlay center to select a keyboard target in the source column", () => {
  expect(targetAt(115, 248, false)).toBe("c2");
});

it("uses the destination column for keyboard append", () => {
  expect(targetAt(365, 114, false)).toBe("planned");
  expect(targetAt(365, 80, false)).toBe("c4");
});

const boardViewport = rect(15, 70, 340, 340);

it.each([
  [14, 114],
  [355, 114],
  [115, 69],
  [115, 410],
])("ignores a pointer at (%i, %i) outside the viewport even when it overlaps a measured column", (x, y) => {
  expect(targetAt(x, y, true, boardViewport)).toBeUndefined();
});

it("keeps the visible portion of a clipped destination targetable", () => {
  expect(targetAt(330, 114, true, boardViewport)).toBe("planned");
});

it("excludes board content clipped by the mobile frame above the assistant", () => {
  expect(targetAt(115, 248, true, boardViewport, rect(0, 0, 390, 200))).toBeUndefined();
  expect(targetAt(115, 114, true, boardViewport, rect(0, 0, 390, 200))).toBe("c1");
});

it("allows a keyboard drag to target a column beyond the scroll viewport", () => {
  expect(targetAt(365, 114, false, boardViewport)).toBe("planned");
});

it("aims a dragged list at a lane slot: above the first list past the pointer, else the lane's end (issue #53)", () => {
  const target = (x: number, y: number, pointer = true) => boardCollisionDetection({
    active: listActive("progress"),
    collisionRect: rect(x - 115, y - 2, 230, 540),
    droppableContainers: listContainers,
    droppableRects: listRects,
    pointerCoordinates: pointer ? { x, y } : null,
  })[0]?.id;
  expect(target(115, 100)).toBe("ideas");
  expect(target(115, 400)).toBe("review");
  expect(target(115, 880)).toBe("lane:0");
  // Gaps between lists and lanes still aim at the nearest lane.
  expect(target(115, 550)).toBe("review");
  expect(target(240, 100)).toBe("ideas");
  expect(target(865, 100)).toBe("lane:3");
  expect(target(1200, 100)).toBe("lane:3");
  // Moved by keyboard, the copy aims from just inside its top.
  expect(target(365, 564, false)).toBe("done");
});
