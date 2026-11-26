import { useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Check, Columns3, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Card, CardPriority, Column } from "./board-state";
import { getCardMove } from "./drag-announcements";
import type { CardChanges } from "./editable-card-content";
import { fieldCharacterLimit } from "./limits";
import { CardDragPreview, TaskCard } from "./task-card";

const cardGap = 11; // Matches the .card-stack gap in globals.css.

type BoardColumnProps = {
  column: Column;
  /** Position on the board, for keyboard moves between lists. */
  index: number;
  /** The visible lane the list shows in, and how many lanes the board shows (issue #53). */
  visibleLane: number;
  laneCount: number;
  /** A dragged list would land directly above this one. */
  dropBefore: boolean;
  /** True while a save is pending or storage is unavailable; controls stay visible but inert. */
  busy: boolean;
  onAdd: (trigger: HTMLButtonElement) => void;
  onDelete: (card: Card, trigger: HTMLButtonElement) => void;
  onDeleteList: (trigger: HTMLButtonElement) => void;
  /** Resolves to an error message, or null once saved. */
  onRename: (name: string) => Promise<string | null>;
  /** Resolves to an error message, or null once saved. */
  onEdit: (cardId: string, changes: CardChanges) => Promise<string | null>;
  onPriority: (cardId: string, priority: CardPriority | null) => Promise<void>;
};

/** Where a card dragged in from another column would land, and the gap that previews it. */
function useInsertionPreview(column: Column, index: number, visibleLane: number) {
  const { setNodeRef } = useDroppable({ id: column.id, data: { type: "column", columnId: column.id, index, visibleLane } });
  const { active, activeNodeRect, over, droppableRects } = useDndContext();
  const isOver = active?.data.current?.type === "card" && over?.data.current?.columnId === column.id;
  const inserting = isOver && active!.data.current?.columnId !== column.id;
  if (!inserting) return { setNodeRef, isOver, inserting, insertionIndex: -1, gapHeight: 0, insertionTop: 0 };

  const insertionIndex = getCardMove({ active, over })?.index ?? column.cards.length;
  const gapHeight = (activeNodeRect?.height ?? 0) + cardGap;
  const firstRect = droppableRects.get(column.cards[0]?.id ?? "");
  const lastRect = droppableRects.get(column.cards.at(-1)?.id ?? "");
  const landingTop = insertionIndex < column.cards.length ? over!.rect.top : (lastRect?.bottom ?? firstRect?.top ?? 0) + cardGap;
  const insertionTop = firstRect ? landingTop - firstRect.top : 0;
  return { setNodeRef, isOver, inserting, insertionIndex, gapHeight, insertionTop };
}

export function BoardColumn({ column, index, visibleLane, laneCount, dropBefore, busy, onAdd, onDelete, onDeleteList, onRename, onEdit, onPriority }: BoardColumnProps) {
  const { setNodeRef, isOver, inserting, insertionIndex, gapHeight, insertionTop } = useInsertionPreview(column, index, visibleLane);
  const [renaming, setRenaming] = useState(false);
  // The header's free space drags the list (issue #53); its buttons and rename field keep their own behavior.
  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: `list:${column.id}`,
    disabled: busy || renaming,
    data: { type: "list", listId: column.id, index, visibleLane, count: laneCount },
    attributes: { role: "group", roleDescription: "draggable list" },
  });
  const controls = "button, input, form, .rename-error";
  const dragListeners = listeners && {
    ...listeners,
    onMouseDown: (event: MouseEvent) => { if (!(event.target as Element).closest(controls)) listeners.onMouseDown(event); },
    onTouchStart: (event: TouchEvent) => { if (!(event.target as Element).closest(controls)) listeners.onTouchStart(event); },
  };
  const [name, setName] = useState(column.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const renameButton = useRef<HTMLButtonElement>(null);
  const renameErrorId = `${column.id}-rename-error`;

  async function finishRename(save: boolean) {
    if (renameSaving || (save && !name.trim())) return;
    if (save) {
      // Keep the editor and draft open until the save is confirmed.
      setRenameSaving(true);
      const error = await onRename(name);
      setRenameSaving(false);
      setRenameError(error ?? "");
      if (error) return;
    }
    setRenameError("");
    setRenaming(false);
    requestAnimationFrame(() => renameButton.current?.focus());
  }

  function startRename() {
    if (busy) return;
    setName(column.name);
    setRenaming(true);
  }

  const renameForm = <form className="rename-form" onSubmit={event => { event.preventDefault(); void finishRename(true); }}>
    <input
      autoFocus
      aria-label="Column name"
      aria-invalid={!!renameError}
      aria-describedby={renameError ? renameErrorId : undefined}
      value={name}
      maxLength={fieldCharacterLimit}
      onChange={event => setName(event.target.value)}
      onKeyDown={event => { if (event.key === "Escape") void finishRename(false); }}
    />
    <button className="icon-button" disabled={!name.trim() || renameSaving} aria-label="Save column name"><Check size={15} /></button>
    <button type="button" className="icon-button" disabled={renameSaving} aria-label="Cancel rename" onClick={() => void finishRename(false)}>
      <X size={15} />
    </button>
  </form>;

  const title = <>
    <h2>{column.name}</h2>
    <span className="column-count">{column.cards.length}</span>
    <button ref={renameButton} aria-disabled={busy} className="icon-button rename-button" aria-label={`Rename ${column.name}`} onClick={startRename}>
      <Pencil size={13} />
    </button>
  </>;

  return <section
    className={`column${isOver ? " is-over" : ""}${isDragging ? " is-list-dragging" : ""}${dropBefore ? " list-drop-target" : ""}`}
    aria-label={`${column.name} column`}
    data-list={column.id}
    ref={node => { setNodeRef(node); setDragRef(node); }}
    style={{ viewTransitionName: `list-${column.id}` }}
  >
    <header
      className={`column-header${busy ? " is-locked" : ""}`}
      ref={setActivatorNodeRef}
      {...attributes}
      // A disabled group would also disable the rename field and buttons inside it.
      aria-disabled={undefined}
      aria-pressed={undefined}
      {...dragListeners}
      aria-label={column.name}
    >
      <span className="status-dot" style={{ background: column.color }} />
      {renaming ? renameForm : title}
      {renameError && <p role="alert" id={renameErrorId} className="form-error rename-error">{renameError}</p>}
      <button
        className="icon-button list-delete"
        disabled={renaming}
        aria-disabled={busy}
        aria-label={`Delete list ${column.name}`}
        onClick={event => { if (!busy) onDeleteList(event.currentTarget); }}
      >
        <Trash2 size={14} />
      </button>
    </header>
    <div className="card-stack" style={{ paddingBottom: gapHeight }}>
      {inserting && <div className="insertion-preview" aria-hidden="true" style={{ top: insertionTop, height: gapHeight - cardGap }} />}
      <SortableContext items={column.cards.map(card => card.id)} strategy={verticalListSortingStrategy}>
        {column.cards.map((card, cardIndex) => <TaskCard
          key={card.id}
          card={card}
          columnId={column.id}
          busy={busy}
          insertOffset={inserting && cardIndex >= insertionIndex ? gapHeight : 0}
          onDelete={trigger => onDelete(card, trigger)}
          onEdit={changes => onEdit(card.id, changes)}
          onPriority={priority => onPriority(card.id, priority)}
        />)}
      </SortableContext>
      {!column.cards.length && !inserting && <div className="empty-column">
        <Columns3 size={23} />
        <p>Drop a card here or add one below.</p>
      </div>}
    </div>
    <button className="add-card" aria-disabled={busy} onClick={event => { if (!busy) onAdd(event.currentTarget); }}>
      <Plus size={16} /> Add a card
    </button>
  </section>;
}

/** The static copy of a list that follows the pointer while it is dragged. */
export function ListDragPreview({ column }: { column: Column }) {
  return <div className="column list-drag-preview drag-preview" aria-hidden="true">
    <div className="column-header">
      <span className="status-dot" style={{ background: column.color }} />
      <h2>{column.name}</h2>
      <span className="column-count">{column.cards.length}</span>
    </div>
    <div className="card-stack">{column.cards.map(card => <CardDragPreview key={card.id} card={card} />)}</div>
  </div>;
}

/**
 * One visible lane (issue #53). It spans the full board height so its free space below the lists, and the
 * gaps between them, are list drop targets; `dropAtEnd` marks a list landing after the lane's last list.
 */
export function BoardLane({ lane, count, dropAtEnd, children }: { lane: number; count: number; dropAtEnd: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `lane:${lane}`, data: { type: "lane", lane, count } });
  return <div ref={setNodeRef} className="board-lane">
    {children}
    {dropAtEnd && <div className="lane-drop-end" aria-hidden="true" />}
  </div>;
}
