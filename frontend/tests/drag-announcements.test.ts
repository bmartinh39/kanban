import { expect, it } from "vitest";
import type { Over } from "@dnd-kit/core";
import { createDragAnnouncements } from "../app/drag-announcements";
import { initialBoard } from "../app/board-state";
import { active, containers, listActive, listContainers } from "./drag-fixtures";

const board = initialBoard.map(column => column.id === "done" ? { ...column, name: "Complete", cards: [] } : column);
const title = "A small moment of delight";

function target(id: string): Over {
  const { data, rect, disabled } = containers.find(container => container.id === id)!;
  return { id, data, rect: rect.current!, disabled };
}

it.each([
  ["c1", "Ideas, position 1 of 3"],
  ["c4", "Planned, position 1 of 3"],
  ["planned", "Planned, position 3 of 3"],
  ["done", "Complete, position 1 of 1"],
])("announces the resulting position at %s", (id, position) => {
  const announcements = createDragAnnouncements(board);
  const event = { active, over: target(id) };
  expect(announcements.onDragOver(event)).toBe(`Moving ${title} to ${position}.`);
  expect(announcements.onDragEnd(event)).toBe(`Dropped ${title} in ${position}.`);
});

it("keeps the pickup announcement and announces a later return to the starting slot", () => {
  const announcements = createDragAnnouncements(board);
  const origin = { active, over: target("c2") };
  expect(announcements.onDragStart({ active })).toBe(`Picked up ${title} in Ideas, position 2 of 3.`);
  expect(announcements.onDragOver(origin)).toBeUndefined();
  announcements.onDragOver({ active, over: target("c1") });
  expect(announcements.onDragOver(origin)).toBe(`Moving ${title} to Ideas, position 2 of 3.`);
});

it("reports the saved position when leaving the board, dropping outside, or cancelling", () => {
  const announcements = createDragAnnouncements(board);
  const outside = { active, over: null };
  expect(announcements.onDragOver(outside)).toBe(`No drop target. ${title} remains in Ideas, position 2 of 3.`);
  expect(announcements.onDragEnd(outside)).toBe(`No move made. ${title} remains in Ideas, position 2 of 3.`);
  expect(announcements.onDragCancel({ active, over: target("planned") })).toBe(
    `Cancelled moving ${title}. It remains in Ideas, position 2 of 3.`,
  );
});

it("announces list moves by lane and position (issue #53)", () => {
  const announcements = createDragAnnouncements(initialBoard);
  const list = listActive("progress");
  const over = (id: string): Over => {
    const { data, rect } = listContainers.find(container => container.id === id)!;
    return { id, data: { current: { ...data.current, count: 3 } }, rect: rect.current!, disabled: false };
  };
  expect(announcements.onDragStart({ active: list })).toBe("Picked up list In progress in lane 3, position 1 of 1.");
  expect(announcements.onDragOver({ active: list, over: over("progress") })).toBeUndefined();
  expect(announcements.onDragOver({ active: list, over: null })).toBe("No drop target. List In progress remains in lane 3, position 1 of 1.");
  expect(announcements.onDragOver({ active: list, over: over("progress") })).toBe("No change. List In progress remains in lane 3, position 1 of 1.");
  expect(announcements.onDragOver({ active: list, over: over("ideas") })).toBe("Moving list In progress to lane 1, position 1 of 3.");
  expect(announcements.onDragOver({ active: list, over: over("done") })).toBe("Moving list In progress to lane 2, position 2 of 3.");
  expect(announcements.onDragEnd({ active: list, over: over("lane:1") })).toBe("Dropped list In progress in lane 2, position 3 of 3.");
  expect(announcements.onDragCancel({ active: list, over: over("ideas") })).toBe("Cancelled moving list In progress. It remains in lane 3, position 1 of 1.");
});
