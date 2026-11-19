import type { Active, Announcements, DragEndEvent, Over } from "@dnd-kit/core";
import { hasSortableData } from "@dnd-kit/sortable";
import type { Action, Column } from "./board-state";

export function getCardMove({ active, over }: Pick<DragEndEvent, "active" | "over">): Extract<Action, { type: "move" }> | undefined {
  if (!over?.data.current) return;
  const columnId = String(over.data.current.columnId);
  const move = { type: "move" as const, cardId: String(active.id), columnId };
  return hasSortableData(over)
    ? { ...move, index: over.data.current.sortable.index }
    : move;
}

function describeDrag(
  board: Column[],
  phase: "pickup" | "preview" | "drop" | "cancel",
  active: Active,
  over: Over | null = null,
) {
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
      // dnd-kit immediately reports the picked-up card as a target.
      const pickedUpInPlace = firstTarget && over?.id === active.id;
      firstTarget = false;
      if (!pickedUpInPlace) return describeDrag(board, "preview", active, over);
    },
    onDragEnd: ({ active, over }) => describeDrag(board, "drop", active, over),
    onDragCancel: ({ active }) => describeDrag(board, "cancel", active),
  };
}
