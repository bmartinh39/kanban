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
  if (context.active?.data.current?.type === "list") return listCoordinates(context, horizontal, direction, currentCoordinates);
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

type Context = Parameters<KeyboardCoordinateGetter>[1]["context"];

/**
 * Keyboard moves for a dragged list (issue #53). Its target is a slot in a visible lane: above one of the
 * lane's lists or at the lane's end. Up and Down step through the lane's slots; Left and Right move to the
 * neighboring lane's slot nearest in height. The dragged copy is placed so collision detection, which aims
 * from just inside its top, finds that slot.
 */
function listCoordinates(context: Context, horizontal: boolean, direction: number, current: { x: number; y: number }) {
  const { collisionRect, droppableRects } = context;
  const enabled = context.droppableContainers.getEnabled();
  const lanes = enabled.filter(({ id, data }) => data.current?.type === "lane" && droppableRects.has(id))
    .toSorted((first, second) => droppableRects.get(first.id)!.left - droppableRects.get(second.id)!.left);
  const listsIn = (lane: number) => enabled
    .filter(({ id, data }) => data.current?.type === "column" && data.current.visibleLane === lane && droppableRects.has(id))
    .map(({ id }) => droppableRects.get(id)!)
    .toSorted((first, second) => first.top - second.top);
  const target = context.over?.data.current;
  const own = context.active!.data.current!;
  const laneAt = (lane: number) => lanes.findIndex(container => container.data.current?.lane === lane);
  let laneIndex = laneAt(target?.type === "lane" ? target.lane : target?.visibleLane ?? own.visibleLane);
  if (!collisionRect || laneIndex < 0) return current;
  const slotTop = (lane: number, slot: number) => {
    const lists = listsIn(lanes[lane].data.current!.lane);
    return slot < lists.length ? lists[slot].top : lists.length ? lists.at(-1)!.bottom : droppableRects.get(lanes[lane].id)!.top;
  };
  const currentLists = listsIn(lanes[laneIndex].data.current!.lane);
  let slot = target?.type === "column"
    ? currentLists.indexOf(droppableRects.get(context.over!.id)!)
    : target?.type === "lane" ? currentLists.length : currentLists.indexOf(droppableRects.get(own.listId)!);
  if (horizontal) {
    const height = slotTop(laneIndex, slot);
    laneIndex += direction;
    if (!lanes[laneIndex]) return current;
    const slots = listsIn(lanes[laneIndex].data.current!.lane).length + 1;
    slot = Array.from({ length: slots }, (_, index) => index)
      .reduce((best, index) => Math.abs(slotTop(laneIndex, index) - height) < Math.abs(slotTop(laneIndex, best) - height) ? index : best, 0);
  } else {
    slot = Math.max(0, Math.min(currentLists.length, slot + direction));
  }
  const laneRect = droppableRects.get(lanes[laneIndex].id)!;
  const lists = listsIn(lanes[laneIndex].data.current!.lane);
  const y = slot < lists.length ? lists[slot].top + 4 : (lists.at(-1)?.bottom ?? laneRect.top) + 4;
  return {
    x: current.x + laneRect.left + laneRect.width / 2 - (collisionRect.left + collisionRect.width / 2),
    y: current.y + y - (collisionRect.top + 2),
  };
}
