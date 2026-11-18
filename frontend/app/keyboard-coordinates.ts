import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

export const columnCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) return;
  event.preventDefault();
  const columns = context.droppableContainers.getEnabled();
  const current = columns.findIndex(column => column.id === context.over?.id);
  const direction = ["ArrowRight", "ArrowDown"].includes(event.code) ? 1 : -1;
  const target = columns[current + direction];
  const targetRect = target && context.droppableRects.get(target.id);
  const activeRect = context.collisionRect;
  if (targetRect && activeRect) return {
    x: currentCoordinates.x + targetRect.left + targetRect.width / 2 - (activeRect.left + activeRect.width / 2),
    y: currentCoordinates.y + targetRect.top + 70 - (activeRect.top + activeRect.height / 2),
  };
  return currentCoordinates;
};
