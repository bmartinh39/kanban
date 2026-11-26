import type { Active, Announcements, DragEndEvent, Over } from "@dnd-kit/core";
import { hasSortableData } from "@dnd-kit/sortable";
import { boardReducer, type BoardCommand, type Column } from "./board-state";
import { visibleLanes } from "./board-lanes";

export function getCardMove({ active, over }: Pick<DragEndEvent, "active" | "over">): Extract<BoardCommand, { type: "move" }> | undefined {
  if (active.data.current?.type !== "card" || !over?.data.current) return;
  const columnId = String(over.data.current.columnId);
  const move = { type: "move" as const, cardId: String(active.id), columnId };
  return hasSortableData(over)
    ? { ...move, index: over.data.current.sortable.index }
    : move;
}

/**
 * Where a dragged list lands (issue #53): over a list, it goes above that list in the list's lane; over a
 * lane's free space, it goes to the end of that lane. Undefined when there is no target or nothing would change.
 */
export function getListMove({ active, over }: Pick<DragEndEvent, "active" | "over">, board: Column[]): Extract<BoardCommand, { type: "move-list" }> | undefined {
  const listId: string | undefined = active.data.current?.type === "list" ? active.data.current.listId : undefined;
  const target = over?.data.current;
  if (!listId || !target) return;
  const others = board.filter(column => column.id !== listId);
  const inLane = (lane: number) => others.filter(column => column.lane === lane);
  let lane: number;
  let index: number;
  if (target.type === "column") {
    const before = others.find(column => column.id === target.columnId);
    if (!before) return;
    lane = before.lane;
    index = inLane(lane).indexOf(before);
  } else if (target.type === "lane") {
    const last = visibleLanes(others, target.count)[target.lane]?.at(-1)?.list;
    lane = last?.lane ?? target.lane;
    index = inLane(lane).length;
  } else return;
  const move = { type: "move-list" as const, columnId: listId, lane, index };
  return boardReducer(board, move) === board ? undefined : move;
}

function listLocation(board: Column[], listId: string, count: number) {
  const lanes = visibleLanes(board, count);
  const lane = lanes.findIndex(entries => entries.some(({ list }) => list.id === listId));
  const position = lanes[lane].findIndex(({ list }) => list.id === listId);
  return `lane ${lane + 1}, position ${position + 1} of ${lanes[lane].length}`;
}

function describeListDrag(board: Column[], phase: "pickup" | "preview" | "drop" | "cancel", active: Active, over: Over | null) {
  const { listId, count } = active.data.current!;
  const list = board.find(column => column.id === listId);
  if (!list) return;
  const origin = listLocation(board, listId, count);
  if (phase === "pickup") return `Picked up list ${list.name} in ${origin}.`;
  if (phase === "cancel") return `Cancelled moving list ${list.name}. It remains in ${origin}.`;
  const move = getListMove({ active, over }, board);
  if (!move) {
    const status = !over ? "No drop target" : phase === "preview" ? "No change" : "No move made";
    return `${status}. List ${list.name} remains in ${origin}.`;
  }
  const location = listLocation(boardReducer(board, move), listId, count);
  return phase === "preview" ? `Moving list ${list.name} to ${location}.` : `Dropped list ${list.name} in ${location}.`;
}

function describeDrag(
  board: Column[],
  phase: "pickup" | "preview" | "drop" | "cancel",
  active: Active,
  over: Over | null = null,
) {
  if (active.data.current?.type === "list") return describeListDrag(board, phase, active, over);
  const source = board.find(column => column.id === active.data.current?.columnId);
  if (!source) return;
  const index = source.cards.findIndex(card => card.id === active.id);
  const card = source.cards[index];
  if (!card) return;

  const origin = `${source.name}, position ${index + 1} of ${source.cards.length}`;
  if (phase === "pickup") return `Picked up ${card.title} in ${origin}.`;
  if (phase === "cancel") return `Cancelled moving ${card.title}. It remains in ${origin}.`;

  const move = getCardMove({ active, over });
  const destination = board.find(column => column.id === move?.columnId);
  if (!move || !destination) {
    const status = phase === "preview" ? "No drop target" : "No move made";
    return `${status}. ${card.title} remains in ${origin}.`;
  }

  const sameColumn = destination === source;
  const count = sameColumn ? source.cards.length : destination.cards.length + 1;
  const position = move.index !== undefined ? move.index + 1 : sameColumn ? index + 1 : count;
  const location = `${destination.name}, position ${position} of ${count}`;
  return phase === "preview" ? `Moving ${card.title} to ${location}.` : `Dropped ${card.title} in ${location}.`;
}

export function createDragAnnouncements(board: Column[]): Announcements {
  let firstTarget = true;
  return {
    onDragStart({ active }) {
      firstTarget = true;
      return describeDrag(board, "pickup", active);
    },
    onDragOver({ active, over }) {
      // dnd-kit immediately reports the picked-up card or list as a target.
      const pickedUpInPlace = firstTarget && !!over && (over.id === active.id || over.id === active.data.current?.listId);
      firstTarget = false;
      if (!pickedUpInPlace) return describeDrag(board, "preview", active, over);
    },
    onDragEnd: ({ active, over }) => describeDrag(board, "drop", active, over),
    onDragCancel: ({ active }) => describeDrag(board, "cancel", active),
  };
}
