import { expect, it } from "vitest";
import type { ClientRect, CollisionDetection } from "@dnd-kit/core";
import { boardCollisionDetection } from "../app/drag-collision";
import { active, containers, rect, rectangles } from "./drag-fixtures";

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

it("targets a populated destination column for append even when pointing at its card", () => {
  expect(targetAt(365, 114)).toBe("planned");
});

it("targets an empty destination column for append", () => {
  expect(targetAt(615, 114)).toBe("done");
});

it("returns no target when the pointer leaves the board while the overlay overlaps it", () => {
  expect(targetAt(740, 114)).toBeUndefined();
});

it("uses the overlay center to select a keyboard target in the source column", () => {
  expect(targetAt(115, 248, false)).toBe("c2");
});

it("uses the destination column for keyboard append", () => {
  expect(targetAt(365, 114, false)).toBe("planned");
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
