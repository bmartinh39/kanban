import { expect, it } from "vitest";
import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { columnCoordinates } from "../app/keyboard-coordinates";

function options(index = 1, hasActiveRect = true, hasTargetRect = true): Parameters<KeyboardCoordinateGetter>[1] {
  return {
    currentCoordinates: { x: 250, y: 70 },
    context: {
      over: { id: `column-${index}` },
      droppableContainers: { getEnabled: () => [0, 1, 2, 3, 4].map(i => ({ id: `column-${i}` })) },
      droppableRects: new Map(hasTargetRect ? [0, 1, 2, 3, 4].map(i => [`column-${i}`, { left: i * 250, top: 0, width: 230, height: 600 }]) : []),
      collisionRect: hasActiveRect ? { left: index * 250 + 10, top: 70, width: 210, height: 150 } : null,
    },
  } as unknown as Parameters<KeyboardCoordinateGetter>[1];
}

it.each(["ArrowRight", "ArrowDown"])("moves to the next column with %s", code => {
  expect(columnCoordinates(new KeyboardEvent("keydown", { code }), options())).toEqual({ x: 500, y: -5 });
});
it.each(["ArrowLeft", "ArrowUp"])("moves to the previous column with %s", code => {
  expect(columnCoordinates(new KeyboardEvent("keydown", { code }), options())).toEqual({ x: 0, y: -5 });
});
it.each([[0, "ArrowLeft"], [4, "ArrowRight"]] as const)("stays inside the five-column boundary at index %i", (index, code) => {
  expect(columnCoordinates(new KeyboardEvent("keydown", { code }), options(index))).toEqual({ x: 250, y: 70 });
});
it("ignores keys unrelated to movement", () => {
  expect(columnCoordinates(new KeyboardEvent("keydown", { code: "KeyA" }), options())).toBeUndefined();
});
it.each([[false, true], [true, false]])("waits until the source and target have been measured", (active, target) => {
  expect(columnCoordinates(new KeyboardEvent("keydown", { code: "ArrowRight" }), options(1, active, target))).toEqual({ x: 250, y: 70 });
});
