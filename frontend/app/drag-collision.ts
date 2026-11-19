import { closestCenter, pointerWithin, type ClientRect, type CollisionDetection } from "@dnd-kit/core";

export function boardCollisionDetection(
  args: Parameters<CollisionDetection>[0],
  viewport?: ClientRect,
  frame?: ClientRect,
): ReturnType<CollisionDetection> {
  const { active, collisionRect, droppableContainers, pointerCoordinates } = args;

  // Measured columns can extend past the scrolling viewport.
  if (pointerCoordinates) {
    const { x, y } = pointerCoordinates;
    if ([viewport, frame].some(rect => rect && (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom))) return [];
  }

  const point = pointerCoordinates ?? {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  const columns = pointerWithin({
    ...args,
    pointerCoordinates: point,
    droppableContainers: droppableContainers.filter(({ data }) => data.current?.type === "column"),
  });
  const columnId = columns[0]?.id;

  if (!columnId) return columns;

  const cardArgs = {
    ...args,
    pointerCoordinates: point,
    droppableContainers: droppableContainers.filter(({ data }) =>
      data.current?.type === "card" && data.current.columnId === columnId
    ),
  };
  if (columnId !== active.data.current?.columnId) {
    // Use untransformed layout rectangles so the animated gap cannot change its own target.
    const next = cardArgs.droppableContainers.toSorted((first, second) =>
      first.data.current!.sortable.index - second.data.current!.sortable.index
    ).find(container => {
      const rect = args.droppableRects.get(container.id);
      return rect && point.y < rect.top + rect.height / 2;
    });
    return next ? [{ id: next.id }] : columns;
  }
  const cards = pointerWithin(cardArgs);
  if (cards.length) return cards;

  // Outside the cards but inside the column, use the nearest position in its stack.
  const closest = closestCenter({
    ...cardArgs,
    collisionRect: { left: point.x, right: point.x, top: point.y, bottom: point.y, width: 0, height: 0 },
  });
  return closest.length ? closest : columns;
}
