import { KeyboardCode, type KeyboardCoordinateGetter, type UniqueIdentifier } from "@dnd-kit/core";
import { hasSortableData } from "@dnd-kit/sortable";

export const columnCoordinates: KeyboardCoordinateGetter = (event, { active, context, currentCoordinates }) => {
  const { code } = event;
  const horizontal = code === KeyboardCode.Left || code === KeyboardCode.Right;
  if (!horizontal && code !== KeyboardCode.Up && code !== KeyboardCode.Down) return;
  event.preventDefault();

  const { collisionRect, droppableRects } = context;
  const current = context.over ?? context.active;
  if (!collisionRect || !current?.data.current) return currentCoordinates;

  const direction = code === KeyboardCode.Right || code === KeyboardCode.Down ? 1 : -1;
  let targetId: UniqueIdentifier | undefined;
  let targetIsColumn = false;

  if (horizontal) {
    const columns = context.droppableContainers.getEnabled().filter(({ data }) => data.current?.type === "column");
    const source = columns.find(column => column.id === current.data.current?.columnId);
    const target = columns.find(column => column.data.current?.index === source?.data.current?.index + direction);
    if (!target) return currentCoordinates;

    // Returning to the source column puts the card back at its original position.
    targetIsColumn = target.id !== context.active?.data.current?.columnId;
    targetId = targetIsColumn ? target.id : active;
  } else if (hasSortableData(current)) {
    const { index, items } = current.data.current.sortable;
    targetId = items[index + direction];
  }

  const targetRect = targetId === undefined ? undefined : droppableRects.get(targetId);
  if (!targetRect) return currentCoordinates;

  const targetY = targetRect.top + (targetIsColumn ? 70 : targetRect.height / 2);
  return {
    x: currentCoordinates.x + targetRect.left + targetRect.width / 2 - (collisionRect.left + collisionRect.width / 2),
    y: currentCoordinates.y + targetY - (collisionRect.top + collisionRect.height / 2),
  };
};
