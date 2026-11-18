import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";

export const boardCollisionDetection: CollisionDetection = args => {
  const { active, collisionRect, droppableContainers } = args;
  const point = args.pointerCoordinates ?? {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  const columns = pointerWithin({
    ...args,
    pointerCoordinates: point,
    droppableContainers: droppableContainers.filter(({ data }) => data.current?.type === "column"),
  });
  const columnId = columns[0]?.id;

  // A different column is always a single append target.
  if (!columnId || columnId !== active.data.current?.columnId) return columns;

  const cardArgs = {
    ...args,
    pointerCoordinates: point,
    droppableContainers: droppableContainers.filter(({ data }) =>
      data.current?.type === "card" && data.current.columnId === columnId
    ),
  };
  const cards = pointerWithin(cardArgs);
  if (cards.length) return cards;

  // Outside the cards but inside the column, use the nearest position in its stack.
  const closest = closestCenter({
    ...cardArgs,
    collisionRect: { left: point.x, right: point.x, top: point.y, bottom: point.y, width: 0, height: 0 },
  });
  return closest.length ? closest : columns;
};
