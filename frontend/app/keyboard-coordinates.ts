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
  const enabled = context.droppableContainers.getEnabled();
  const cardsIn = (columnId: UniqueIdentifier) => enabled.filter(({ data }) =>
    data.current?.type === "card" && data.current.columnId === columnId
  ).toSorted((first, second) => first.data.current!.sortable.index - second.data.current!.sortable.index);

  if (horizontal) {
    const columns = enabled.filter(({ data }) => data.current?.type === "column");
    const source = columns.find(column => column.id === current.data.current?.columnId);
    const target = columns.find(column => column.data.current?.index === source?.data.current?.index + direction);
    if (!target) return currentCoordinates;

    // Returning to the source column puts the card back at its original position.
    targetIsColumn = target.id !== context.active?.data.current?.columnId;
    targetId = targetIsColumn ? target.id : active;
  } else if (current.data.current.columnId !== context.active?.data.current?.columnId) {
    const cards = cardsIn(current.data.current.columnId);
    const index = hasSortableData(current) ? current.data.current.sortable.index : cards.length;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex > cards.length) return currentCoordinates;
    targetIsColumn = nextIndex === cards.length;
    targetId = targetIsColumn ? current.data.current.columnId : cards[nextIndex].id;
  } else if (hasSortableData(current)) {
    const { index, items } = current.data.current.sortable;
    targetId = items[index + direction];
  }

  const targetRect = targetId === undefined ? undefined : droppableRects.get(targetId);
  if (!targetRect) return currentCoordinates;

  const destination = enabled.find(container => container.id === targetId);
  const crossColumn = destination?.data.current?.columnId !== context.active?.data.current?.columnId;
  const lastCard = targetIsColumn ? cardsIn(targetId!).at(-1) : undefined;
  const lastRect = lastCard && droppableRects.get(lastCard.id);
  const targetY = targetIsColumn
    ? lastRect ? lastRect.bottom + 11 : targetRect.top + 70
    : targetRect.top + (crossColumn ? targetRect.height / 4 : targetRect.height / 2);
  return {
    x: currentCoordinates.x + targetRect.left + targetRect.width / 2 - (collisionRect.left + collisionRect.width / 2),
    y: currentCoordinates.y + targetY - (collisionRect.top + collisionRect.height / 2),
  };
};
