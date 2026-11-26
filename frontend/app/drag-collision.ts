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

  // A dragged list (issue #53) aims at the lane under the pointer (or the nearest one), over its full height
  // including gaps: above the first list whose middle is below the pointer, else at the end of the lane.
  // Moved by keyboard, it aims from just inside the top of the dragged copy.
  if (active.data.current?.type === "list") {
    const point = pointerCoordinates ?? { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + 2 };
    const measured = (type: string) => droppableContainers
      .filter(({ id, data }) => data.current?.type === type && args.droppableRects.has(id))
      .map(container => ({ container, rect: args.droppableRects.get(container.id)! }));
    const distance = ({ rect }: { rect: ClientRect }) => Math.max(rect.left - point.x, point.x - rect.right, 0);
    const lane = measured("lane").toSorted((first, second) => distance(first) - distance(second))[0];
    if (!lane) return [];
    const before = measured("column")
      .filter(({ container }) => container.data.current?.visibleLane === lane.container.data.current?.lane)
      .toSorted((first, second) => first.rect.top - second.rect.top)
      .find(({ rect }) => point.y < rect.top + rect.height / 2);
    return [{ id: (before ?? lane).container.id }];
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
