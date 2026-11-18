import type { Active, ClientRect, DroppableContainer } from "@dnd-kit/core";

export function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export const rectangles = new Map([
  ["ideas", rect(0, 0, 230, 540)],
  ["planned", rect(250, 0, 230, 540)],
  ["done", rect(500, 0, 230, 540)],
  ["c1", rect(10, 64, 210, 100)],
  ["c2", rect(10, 175, 210, 145)],
  ["c3", rect(10, 331, 210, 80)],
  ["c4", rect(260, 64, 210, 100)],
]);

export const containers: DroppableContainer[] = [
  ...["ideas", "planned", "done"].map((columnId, index) => ({
    id: columnId,
    data: { current: { type: "column", columnId, index } },
  })),
  ...["c1", "c2", "c3", "c4"].map((id, index) => {
    const items = index === 3 ? ["c4"] : ["c1", "c2", "c3"];
    const columnId = index === 3 ? "planned" : "ideas";
    return { id, data: { current: { type: "card", columnId, sortable: { containerId: columnId, index: items.indexOf(id), items } } } };
  }),
].map(container => ({
  ...container,
  key: container.id,
  disabled: false,
  node: { current: null },
  rect: { current: rectangles.get(container.id)! },
}));

export const active: Active = {
  id: "c2",
  data: containers.find(container => container.id === "c2")!.data,
  rect: { current: { initial: rectangles.get("c2")!, translated: null } },
};
