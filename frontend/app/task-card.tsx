import type { MouseEvent, TouchEvent } from "react";
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
    attributes: { role: "article", roleDescription: "draggable card" },
  });
  // The card is the drag source (issue #50). A mouse drags only from the free space around the text, which
  // stays clickable and selectable; a long touch press drags from anywhere except the strip's controls.
  const ignore = (event: { target: EventTarget }, controls: string) => (event.target as Element).closest(controls);
  const dragListeners = listeners && {
    ...listeners,
    onMouseDown: (event: MouseEvent) => { if (!ignore(event, ".card-strip, .editable-text, .card-editor")) listeners.onMouseDown(event); },
    onTouchStart: (event: TouchEvent) => { if (!ignore(event, ".card-strip, .card-editor")) listeners.onTouchStart(event); },
  };
  const offsetX = transform?.x ?? 0;
  const offsetY = (transform?.y ?? 0) + insertOffset;
  const style = {
    transform: transform || insertOffset ? `translate3d(${offsetX}px, ${offsetY}px, 0)` : undefined,
    transition,
    viewTransitionName: `card-${card.id}`,
  };

  return <article
    // As the activator too, so Space typed in the card's text editors cannot pick the card up.
    ref={node => { setNodeRef(node); setActivatorNodeRef(node); }}
    style={style}
    className={`task-card${isDragging ? " is-dragging" : ""}`}
    data-testid={`card-${card.id}`}
    {...attributes}
    aria-pressed={undefined}
    {...dragListeners}
    aria-label={card.title}
  >
    <div className="card-strip">
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
      <span className="priority-bar" data-priority={card.priority}><PriorityLabel priority={card.priority} /></span>
      <span className="delete-button" />
    </div>
    <div className="card-content">
      <h3>{card.title}</h3>
      {card.details && <p>{card.details}</p>}
    </div>
  </div>;
}
