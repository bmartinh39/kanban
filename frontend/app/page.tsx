"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDndContext, useDroppable, useSensor, useSensors, type DragCancelEvent, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Bot, Check, Columns3, GripVertical, LayoutGrid, Pencil, Plus, Trash2, X } from "lucide-react";
import { columnCoordinates } from "./keyboard-coordinates";
import { boardCollisionDetection } from "./drag-collision";
import { createDragAnnouncements, getCardMove } from "./drag-announcements";
import { boardReducer, type Card, type CardPriority, type Column } from "./board-state";
import { type BoardCommand } from "./board-commands";
import { useBoard } from "./use-board";
import { AssistantChat } from "./assistant-chat";
import { DeleteCardDialog, DeleteListDialog } from "./delete-list-dialog";
import { prepareActions, type AssistantPlan } from "./assistant-commands";
import { CardPriorityButton, PriorityLabel } from "./card-priority-button";
import { EditableCardContent } from "./editable-card-content";
import { fieldCharacterLimit } from "./limits";


const emptyBoard: Column[] = [];

function committed(board: Column[], action: BoardCommand) {
  if (action.type === "add") return board.some(column => column.cards.some(card => card.id === action.card.id));
  if (action.type === "create-list") return board.some(column => column.id === action.listId);
  if (action.type === "rename") return board.some(column => column.id === action.columnId && column.name === action.name);
  if (action.type === "edit") return board.some(column => column.cards.some(card => card.id === action.cardId &&
    (action.title === undefined || card.title === action.title) && (action.details === undefined || card.details === action.details)));
  return false;
}

function CardContent({ card }: { card: Card }) {
  return <div className="card-content"><h3>{card.title}</h3>{card.details && <p>{card.details}</p>}</div>;
}

function TaskCard({ card, columnId, busy, insertOffset = 0, onDelete, onEdit, onPriority }: {
  card: Card; columnId: string; busy: boolean; insertOffset?: number;
  onDelete: (trigger: HTMLButtonElement) => void;
  onEdit: (changes: { title?: string; details?: string }) => Promise<string | null>;
  onPriority: (priority: CardPriority | null) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, transform, transition } = useSortable({
    id: card.id,
    disabled: busy,
    data: { type: "card", columnId },
  });
  const style = {
    transform: transform || insertOffset ? `translate3d(${transform?.x ?? 0}px, ${(transform?.y ?? 0) + insertOffset}px, 0)` : undefined,
    transition,
    viewTransitionName: `card-${card.id}`,
  };
  return <article ref={setNodeRef} style={style} className={`task-card${isDragging ? " is-dragging" : ""}`} data-testid={`card-${card.id}`}>
    <div className="card-strip">
      <button type="button" ref={setActivatorNodeRef} className="drag-handle" {...attributes} {...listeners} aria-label={`Move ${card.title}`} />
      <CardPriorityButton card={card} busy={busy} onChange={onPriority} />
      <button type="button" className="delete-button" aria-disabled={busy} onClick={event => { if (!busy) onDelete(event.currentTarget); }} aria-label={`Delete ${card.title}`}>
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
    <EditableCardContent card={card} busy={busy} onSave={onEdit} />
  </article>;
}

function BoardColumn({ column, index, busy, onAdd, onDelete, onDeleteList, onRename, onEdit, onPriority }: {
  column: Column; index: number; busy: boolean;
  onAdd: (trigger: HTMLButtonElement) => void;
  onDelete: (card: Card, trigger: HTMLButtonElement) => void;
  onDeleteList: (trigger: HTMLButtonElement) => void;
  onRename: (name: string) => Promise<string | null>;
  onEdit: (cardId: string, changes: { title?: string; details?: string }) => Promise<string | null>;
  onPriority: (cardId: string, priority: CardPriority | null) => Promise<void>;
}) {
  const { setNodeRef } = useDroppable({ id: column.id, data: { type: "column", columnId: column.id, index } });
  const { active, activeNodeRect, over, droppableRects } = useDndContext();
  const isOver = over?.data.current?.columnId === column.id;
  const inserting = isOver && active && active.data.current?.columnId !== column.id;
  const insertionIndex = inserting ? getCardMove({ active, over })?.index ?? column.cards.length : -1;
  const gapHeight = inserting ? (activeNodeRect?.height ?? 0) + 11 : 0;
  const firstRect = droppableRects.get(column.cards[0]?.id ?? "");
  const lastRect = droppableRects.get(column.cards.at(-1)?.id ?? "");
  const insertionTop = inserting && firstRect ? (insertionIndex < column.cards.length ? over!.rect.top : (lastRect?.bottom ?? firstRect.top) + 11) - firstRect.top : 0;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const renameButton = useRef<HTMLButtonElement>(null);
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
  return <section className={`column column-${index}${isOver ? " is-over" : ""}`} aria-label={`${column.name} column`} ref={setNodeRef} style={{ viewTransitionName: `list-${column.id}` }}>
    <header className="column-header">
      <span className="status-dot" />
      {renaming ? <form className="rename-form" onSubmit={event => { event.preventDefault(); void finishRename(true); }}>
        <input autoFocus aria-label="Column name" aria-invalid={!!renameError} aria-describedby={renameError ? `${column.id}-rename-error` : undefined} value={name} maxLength={fieldCharacterLimit} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Escape") void finishRename(false); }} />
        <button className="icon-button" disabled={!name.trim() || renameSaving} aria-label="Save column name"><Check size={15} /></button>
        <button type="button" className="icon-button" disabled={renameSaving} aria-label="Cancel rename" onClick={() => void finishRename(false)}><X size={15} /></button>
      </form> : <><h2>{column.name}</h2><span className="column-count">{column.cards.length}</span><button ref={renameButton} aria-disabled={busy} className="icon-button rename-button" aria-label={`Rename ${column.name}`} onClick={() => { if (busy) return; setName(column.name); setRenaming(true); }}><Pencil size={13} /></button></>}
      {renameError && <p role="alert" id={`${column.id}-rename-error`} className="form-error rename-error">{renameError}</p>}
      <button className="icon-button list-delete" disabled={renaming} aria-disabled={busy} aria-label={`Delete list ${column.name}`} onClick={event => { if (!busy) onDeleteList(event.currentTarget); }}><Trash2 size={14} /></button>
    </header>
    <div className="card-stack" style={{ paddingBottom: gapHeight }}>
      {inserting && <div className="insertion-preview" aria-hidden="true" style={{ top: insertionTop, height: gapHeight - 11 }} />}
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
      {!column.cards.length && !inserting && <div className="empty-column"><Columns3 size={23} /><p>Drop a card here or add one below.</p></div>}
    </div>
    <button className="add-card" aria-disabled={busy} onClick={event => { if (!busy) onAdd(event.currentTarget); }}><Plus size={16} /> Add a card</button>
  </section>;
}

function AddItemDialog({ columnName, onClose, onAdd }: {
  columnName?: string;
  onClose: () => void;
  /** Saves with a stable ID; resolves to an error message, or null once saved. */
  onAdd: (id: string, title: string, details: string) => Promise<string | null>;
}) {
  const isList = columnName === undefined;
  // Reused on retry, so a save that committed despite an error cannot be duplicated.
  const [id] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const errorId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    titleInput.current!.focus();
    return () => element.close();
  }, []);
  async function submit() {
    if (saving || !title.trim()) return;
    setSaving(true);
    setError("");
    const failure = await onAdd(id, title, details);
    if (failure) { setSaving(false); setError(failure); }
  }
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>(":is(button, input, textarea):not(:disabled)");
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form aria-describedby={error ? errorId : undefined} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="dialog-heading"><h2 id={titleId}>{isList ? "Add a list" : "Add a card"}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>
      {!isList && <p className="dialog-subtitle">List <strong>{columnName}</strong></p>}
      <label htmlFor="item-title">{isList ? "List name" : "Title"} <span className="required-label">Required</span></label>
      <input id="item-title" ref={titleInput} placeholder={isList ? "What is this stage called?" : "What needs to happen?"} value={title} onChange={event => setTitle(event.target.value)} maxLength={fieldCharacterLimit} required />
      {!isList && <><label htmlFor="card-details">Details <span className="optional-label">Optional</span></label>
      <textarea id="card-details" placeholder="A little context goes a long way..." value={details} onChange={event => setDetails(event.target.value)} maxLength={fieldCharacterLimit} rows={4} /></>}
      {error && <p role="alert" id={errorId} className="form-error">{error}</p>}
      <div className="dialog-actions"><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim() || saving}>{saving ? "Saving..." : isList ? "Create list" : "Add card"} <Plus size={16} /></button></div>
    </form>
  </dialog>;
}

export default function Home() {
  const storage = useBoard();
  const [dropPreview, setDropPreview] = useState<Column[] | null>(null);
  const savedBoard = storage.snapshot?.columns ?? emptyBoard;
  const board = dropPreview ?? savedBoard;
  function dispatch(action: BoardCommand) {
    return storage.save([action]).catch(() => {});
  }
  // For forms: resolves to null once saved, or to an error so the form keeps its draft.
  async function saveCommand(action: BoardCommand): Promise<string | null> {
    try {
      await storage.save([action]);
      return null;
    } catch (error) {
      // A failed save is read back. If that shows the command committed, treat it as saved.
      return committed(storage.current.current?.columns ?? [], action) ? null : (error as Error).message;
    }
  }
  async function applyAssistant(snapshot: Column[], plan: AssistantPlan, revision: number) {
    if (storage.current.current?.columns !== snapshot) throw new Error("The board changed while I was thinking. Send your request again to use the latest board. No changes were made.");
    const { actions, message } = prepareActions(snapshot, plan);
    await storage.save(actions as BoardCommand[], revision);
    return message;
  }
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [deletingCard, setDeletingCard] = useState<{ card: Card; columnId: string } | null>(null);
  const deletedCardColumn = useRef<string | null>(null);
  const [deletingList, setDeletingList] = useState<Column | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const assistantLauncher = useRef<HTMLButtonElement>(null);
  // Lists and cards resize between two layouts. A view transition morphs each box once and
  // crossfades its re-wrapped text, instead of re-wrapping on every animation frame.
  function collapseAssistant(collapsed: boolean, afterUpdate?: () => void) {
    const update = () => {
      flushSync(() => setAssistantCollapsed(collapsed));
      afterUpdate?.();
    };
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) update();
    else document.startViewTransition(update);
  }
  const addTrigger = useRef<HTMLButtonElement>(null);
  const boardViewport = useRef<HTMLDivElement>(null);
  const keyboardDrop = useRef<string | null>(null);
  const createdList = useRef<string | null>(null);
  const deletedList = useRef(false);
  useLayoutEffect(() => {
    if (storage.saving || !deletedList.current) return;
    deletedList.current = false;
    document.querySelector<HTMLButtonElement>(".add-list")?.focus({ preventScroll: true });
  }, [savedBoard, storage.saving]);
  useLayoutEffect(() => {
    if (storage.saving || !deletedCardColumn.current) return;
    const index = savedBoard.findIndex(column => column.id === deletedCardColumn.current);
    deletedCardColumn.current = null;
    boardViewport.current?.querySelectorAll<HTMLButtonElement>(".add-card")[index]?.focus({ preventScroll: true });
  }, [savedBoard, storage.saving]);
  function deleteList(column: Column) {
    deletedList.current = true;
    setDeletingList(null);
    dispatch({ type: "delete-list", columnId: column.id });
  }
  function cancelDelete() {
    setDeletingList(null);
    setDeletingCard(null);
    requestAnimationFrame(() => addTrigger.current?.focus({ preventScroll: true }));
  }
  useLayoutEffect(() => {
    if (storage.saving || !createdList.current) return;
    const index = savedBoard.findIndex(column => column.id === createdList.current);
    if (index >= 0) boardViewport.current?.querySelectorAll(".column-header")[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    createdList.current = null;
  }, [savedBoard, storage.saving]);
  useLayoutEffect(() => {
    if (storage.saving || !keyboardDrop.current) return;
    const cardId = keyboardDrop.current;
    keyboardDrop.current = null;
    const card = Array.from(boardViewport.current?.querySelectorAll<HTMLElement>("[data-testid]") ?? []).find(element => element.dataset.testid === `card-${cardId}`);
    card?.querySelector<HTMLButtonElement>(".drag-handle")?.focus();
  }, [board, storage.saving]);
  function closeDialog() {
    // Remove the modal before focusing: while it is open the rest of the page is inert. After an awaited
    // save, a deferred render could otherwise run after a scheduled focus and drop it.
    flushSync(() => {
      setAddingTo(null);
      setAddingList(false);
    });
    addTrigger.current?.focus();
  }
  function handleDragCancel({ activatorEvent }: DragCancelEvent) {
    setActiveId(null);
    const target = activatorEvent.target;
    if (activatorEvent instanceof KeyboardEvent && target instanceof HTMLElement) {
      // The handle may still have focus while the board is scrolled to another column.
      requestAnimationFrame(() => target.scrollIntoView({ block: "nearest", inline: "nearest" }));
    }
  }
  async function handleDragEnd(event: DragEndEvent) {
    const move = getCardMove(event);
    setActiveId(null);
    if (!move) return;
    if (event.activatorEvent instanceof KeyboardEvent) keyboardDrop.current = move.cardId;
    // Commit the visual position before the overlay measures its landing target.
    // Keep the saved snapshot/revision untouched until the server confirms the move.
    setDropPreview(boardReducer(board, move));
    try { await storage.save([move]); } catch { /* The persistence hook shows recovery feedback. */ }
    finally { setDropPreview(null); }
  }

  const announcements = useMemo(() => createDragAnnouncements(savedBoard), [savedBoard]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates, scrollBehavior: "auto" }),
  );
  const activeCard = board.flatMap(column => column.cards).find(card => card.id === activeId);
  const addingColumn = board.find(column => column.id === addingTo);
  if (!storage.snapshot) return <main className="board-loading"><h1>Forma</h1>{storage.loading ? <p role="status">Loading your board...</p> : <><p role="alert">{storage.error}</p><button className="primary-button" onClick={() => void storage.load()}>Retry loading board</button></>}</main>;
  return <div className={`app-shell${assistantCollapsed ? " assistant-collapsed" : ""}`}>
    <header className="topbar">
      <div className="brand" aria-label="Forma"><span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>forma<span className="brand-period">.</span></div>
      <button type="button" ref={assistantLauncher} className="secondary-button assistant-toggle" aria-expanded={assistantOpen} aria-controls="board-assistant" onClick={event => {
        event.currentTarget.focus();
        // The same launcher opens the mobile drawer or re-expands the collapsed desktop panel.
        if (window.matchMedia("(max-width: 700px)").matches) setAssistantOpen(true);
        else collapseAssistant(false);
      }}><Bot size={17} aria-hidden="true" /> AI Assistant</button>
    </header>
    <main>
      <div className="board-toolbar">
        <div className="board-label"><LayoutGrid size={19} aria-hidden="true" /><h1>Project board</h1></div>
        <span className="save-status" aria-live="polite">{storage.saving ? "Saving..." : !storage.available ? "Disconnected" : storage.error ? "Save error" : "Saved"}</span>
        <button className="primary-button add-list" aria-disabled={storage.saving || !storage.available || activeId !== null} onClick={event => { if (storage.saving || !storage.available || activeId !== null) return; addTrigger.current = event.currentTarget; setAddingList(true); }}>Add list <Plus size={16} aria-hidden="true" /></button>
      </div>
      {storage.error && <div className="storage-error"><p role="alert">{storage.error}</p><button className="secondary-button" disabled={storage.loading || storage.saving} onClick={() => void storage.load()}>Reload board</button></div>}
      <DndContext
        id="project-board"
        sensors={sensors}
        collisionDetection={args => boardCollisionDetection(args, boardViewport.current?.getBoundingClientRect(), new DOMRect(0, 0, window.innerWidth, window.innerHeight))}
        onDragStart={event => setActiveId(String(event.active.id))}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: "Press Space to pick up a card. Use Up and Down to reorder it within its column. Use Left and Right to move it to another column. Press Space to drop, or Escape to cancel." } }}
      >
        <div ref={boardViewport} className="board-scroll" aria-label="Project board columns" tabIndex={0}>
          <div className="board-grid">{board.map((column, index) => <BoardColumn
            key={column.id}
            column={column}
            index={index}
            busy={storage.saving || !storage.available}
            onAdd={trigger => { addTrigger.current = trigger; setAddingTo(column.id); }}
            onDelete={(card, trigger) => { addTrigger.current = trigger; setDeletingCard({ card, columnId: column.id }); }}
            onDeleteList={trigger => { addTrigger.current = trigger; setDeletingList(column); }}
            onRename={name => saveCommand({ type: "rename", columnId: column.id, name: name.trim() })}
            onEdit={(cardId, changes) => saveCommand({ type: "edit", cardId, ...changes })}
            onPriority={(cardId, priority) => dispatch({ type: "set-priority", cardId, priority })}
          />)}</div>
          {!board.length && <div className="empty-board"><Columns3 size={25} /><p>Add a list to get started.</p></div>}
        </div>
        <DragOverlay>{activeCard && <div className="task-card drag-preview" aria-hidden="true">
          <div className="card-strip">
            <span className="drag-handle" />
            <span className="priority-bar" data-priority={activeCard.priority}><PriorityLabel priority={activeCard.priority} /></span>
            <span className="delete-button" />
          </div>
          <CardContent card={activeCard} />
        </div>}</DragOverlay>
      </DndContext>
      <AssistantChat drawerOpen={assistantOpen} onCloseDrawer={() => setAssistantOpen(false)} collapsed={assistantCollapsed} onCollapse={() => {
        collapseAssistant(true, () => assistantLauncher.current?.focus());
      }} board={board} revision={storage.snapshot.revision} disabled={storage.saving || !storage.available} onRefresh={() => void storage.load()} onApply={applyAssistant} />
    </main>
    {addingColumn && <AddItemDialog columnName={addingColumn.name} onClose={closeDialog} onAdd={async (id, title, details) => {
      const error = await saveCommand({ type: "add", columnId: addingColumn.id, card: { id, title, details } });
      if (!error) closeDialog();
      return error;
    }} />}
    {addingList && <AddItemDialog onClose={closeDialog} onAdd={async (listId, name) => {
      createdList.current = listId;
      const error = await saveCommand({ type: "create-list", listId, name });
      if (error) createdList.current = null;
      else closeDialog();
      return error;
    }} />}
    {deletingCard && <DeleteCardDialog card={deletingCard.card} onClose={cancelDelete} onDelete={() => {
      deletedCardColumn.current = deletingCard.columnId;
      setDeletingCard(null);
      dispatch({ type: "delete", cardId: deletingCard.card.id });
    }} />}
    {deletingList && <DeleteListDialog columns={[deletingList]} onClose={cancelDelete} onDelete={() => deleteList(deletingList)} />}
  </div>;
}
