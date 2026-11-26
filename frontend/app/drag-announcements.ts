import type { Active, Announcements, DragEndEvent, Over } from "@dnd-kit/core";
import { hasSortableData } from "@dnd-kit/sortable";
import type { BoardCommand, Column } from "./board-state";

export function getCardMove({ active, over }: Pick<DragEndEvent, "active" | "over">): Extract<BoardCommand, { type: "move" }> | undefined {
  if (active.data.current?.type !== "card" || !over?.data.current) return;
  const columnId = String(over.data.current.columnId);
  const move = { type: "move" as const, cardId: String(active.id), columnId };
  return hasSortableData(over)
    ? { ...move, index: over.data.current.sortable.index }
    : move;
}

/** A list dropped on another list takes that list's slot in the board order (issue #53). */
export function getListMove({ active, over }: Pick<DragEndEvent, "active" | "over">): Extract<BoardCommand, { type: "move-list" }> | undefined {
  if (active.data.current?.type !== "list" || over?.data.current?.type !== "column") return;
  return { type: "move-list", columnId: active.data.current.listId, index: over.data.current.index };
}

function describeListDrag(board: Column[], phase: "pickup" | "preview" | "drop" | "cancel", active: Active, over: Over | null) {
  const index = board.findIndex(column => column.id === active.data.current?.listId);
  if (index < 0) return;
  const name = board[index].name;
  const origin = `position ${index + 1} of ${board.length}`;
  if (phase === "pickup") return `Picked up list ${name} at ${origin}.`;
  if (phase === "cancel") return `Cancelled moving list ${name}. It remains at ${origin}.`;
  const move = getListMove({ active, over });
  if (!move) return `${phase === "preview" ? "No drop target" : "No move made"}. List ${name} remains at ${origin}.`;
  const location = `position ${move.index + 1} of ${board.length}`;
  return phase === "preview" ? `Moving list ${name} to ${location}.` : `Dropped list ${name} at ${location}.`;
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
