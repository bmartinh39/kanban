import { useSortable } from "@dnd-kit/sortable";
import { Trash2 } from "lucide-react";
import type { Card, CardPriority } from "./board-state";
import { CardPriorityButton, PriorityLabel } from "./card-priority-button";
import { EditableCardContent, type CardChanges } from "./editable-card-content";

type TaskCardProps = {
  card: Card;
  columnId: string;
  /** True while a save is pending or storage is unavailable; controls stay visible but inert. */
  busy: boolean;
  /** Extra downward shift while a card from another column previews its insertion above this one. */
  insertOffset?: number;
  onDelete: (trigger: HTMLButtonElement) => void;
  /** Resolves to an error message, or null once saved. */
  onEdit: (changes: CardChanges) => Promise<string | null>;
  onPriority: (priority: CardPriority | null) => Promise<void>;
};

export function TaskCard({ card, columnId, busy, insertOffset = 0, onDelete, onEdit, onPriority }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, transform, transition } = useSortable({
    id: card.id,
    disabled: busy,
    data: { type: "card", columnId },
  });
  const offsetX = transform?.x ?? 0;
  const offsetY = (transform?.y ?? 0) + insertOffset;
  const style = {
    transform: transform || insertOffset ? `translate3d(${offsetX}px, ${offsetY}px, 0)` : undefined,
    transition,
    viewTransitionName: `card-${card.id}`,
  };

  return <article
    ref={setNodeRef}
    style={style}
    className={`task-card${isDragging ? " is-dragging" : ""}`}
    data-testid={`card-${card.id}`}
  >
    <div className="card-strip">
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label={`Move ${card.title}`}
      />
      <CardPriorityButton card={card} busy={busy} onChange={onPriority} />
      <button
        type="button"
        className="delete-button"
        aria-disabled={busy}
        aria-label={`Delete ${card.title}`}
        onClick={event => { if (!busy) onDelete(event.currentTarget); }}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
    <EditableCardContent card={card} busy={busy} onSave={onEdit} />
  </article>;
}

/** The static copy of a card that follows the pointer while dragging. */
export function CardDragPreview({ card }: { card: Card }) {
  return <div className="task-card drag-preview" aria-hidden="true">
    <div className="card-strip">
      <span className="drag-handle" />
      <span className="priority-bar" data-priority={card.priority}><PriorityLabel priority={card.priority} /></span>
      <span className="delete-button" />
    </div>
    <div className="card-content">
      <h3>{card.title}</h3>
      {card.details && <p>{card.details}</p>}
    </div>
  </div>;
}
