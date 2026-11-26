"use client";

import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragCancelEvent, type DragEndEvent } from "@dnd-kit/core";
import { Bot, Columns3, LayoutGrid, Plus } from "lucide-react";
import { columnCoordinates } from "./keyboard-coordinates";
import { boardCollisionDetection } from "./drag-collision";
import { createDragAnnouncements, getCardMove } from "./drag-announcements";
import { boardReducer, type BoardCommand, type Card, type Column } from "./board-state";
import { useBoard } from "./use-board";
import { AssistantChat } from "./assistant-chat";
import { DeleteCardDialog, DeleteListDialog } from "./delete-list-dialog";
import { prepareActions, type AssistantPlan } from "./assistant-commands";
import { AddItemDialog } from "./add-item-dialog";
import { BoardColumn } from "./board-column";
import { boardLanes, useLaneCount } from "./board-lanes";
import { CardDragPreview } from "./task-card";

const emptyBoard: Column[] = [];
const dragInstructions = "Press Space to pick up a card. Use Up and Down to reorder it within its column. " +
  "Use Left and Right to move it to another column. Press Space to drop, or Escape to cancel.";

/** Whether a board read back after a failed save already contains the command's result. */
function committed(board: Column[], action: BoardCommand) {
  const cards = board.flatMap(column => column.cards);
  switch (action.type) {
    case "add": return cards.some(card => card.id === action.card.id);
    case "create-list": return board.some(column => column.id === action.listId);
    case "rename": return board.some(column => column.id === action.columnId && column.name === action.name);
    case "edit": return cards.some(card => card.id === action.cardId &&
      (action.title === undefined || card.title === action.title) &&
      (action.details === undefined || card.details === action.details));
    default: return false;
  }
}

export default function Home() {
  const storage = useBoard();
  const [dropPreview, setDropPreview] = useState<Column[] | null>(null);
  const savedBoard = storage.snapshot?.columns ?? emptyBoard;
  const board = dropPreview ?? savedBoard;
  const busy = storage.saving || !storage.available;

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
  // The batch is saved against the revision it was planned for; a changed board is rejected, never merged.
  async function applyAssistant(snapshot: Column[], plan: AssistantPlan, revision: number) {
    const { actions, message } = prepareActions(snapshot, plan);
    await storage.save(actions, revision);
    return message;
  }

  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [deletingCard, setDeletingCard] = useState<{ card: Card; columnId: string } | null>(null);
  const [deletingList, setDeletingList] = useState<Column | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const assistantLauncher = useRef<HTMLButtonElement>(null);
  /** The control that opened the current dialog; focus returns to it. */
  const addTrigger = useRef<HTMLButtonElement>(null);
  const boardViewport = useRef<HTMLDivElement>(null);
  const [laneCount, laneGrid] = useLaneCount();
  // Follow-ups that wait for a save to settle: focus or scroll the right element afterwards.
  const keyboardDrop = useRef<string | null>(null);
  const createdList = useRef<string | null>(null);
  const deletedList = useRef(false);
  const deletedCardColumn = useRef<string | null>(null);

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
  function openAssistant(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.focus();
    // The same launcher opens the mobile drawer or re-expands the collapsed desktop panel.
    if (window.matchMedia("(max-width: 700px)").matches) setAssistantOpen(true);
    else collapseAssistant(false);
  }

  // Lists sit in lanes, so DOM order is not board order; find a list by its id.
  function listElement(id: string) {
    return Array.from(boardViewport.current?.querySelectorAll<HTMLElement>("[data-list]") ?? []).find(element => element.dataset.list === id);
  }
  useLayoutEffect(() => {
    if (storage.saving || !deletedList.current) return;
    deletedList.current = false;
    document.querySelector<HTMLButtonElement>(".add-list")?.focus({ preventScroll: true });
  }, [savedBoard, storage.saving]);
  useLayoutEffect(() => {
    if (storage.saving || !deletedCardColumn.current) return;
    listElement(deletedCardColumn.current)?.querySelector<HTMLButtonElement>(".add-card")?.focus({ preventScroll: true });
    deletedCardColumn.current = null;
  }, [savedBoard, storage.saving]);
  useLayoutEffect(() => {
    if (storage.saving || !createdList.current) return;
    listElement(createdList.current)?.querySelector(".column-header")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    createdList.current = null;
  }, [savedBoard, storage.saving]);
  useLayoutEffect(() => {
    if (storage.saving || !keyboardDrop.current) return;
    const cardId = keyboardDrop.current;
    keyboardDrop.current = null;
    const card = Array.from(boardViewport.current?.querySelectorAll<HTMLElement>("[data-testid]") ?? [])
      .find(element => element.dataset.testid === `card-${cardId}`);
    card?.querySelector<HTMLButtonElement>(".drag-handle")?.focus();
  }, [board, storage.saving]);

  function openAddList(event: MouseEvent<HTMLButtonElement>) {
    if (busy || activeId !== null) return;
    addTrigger.current = event.currentTarget;
    setAddingList(true);
  }
  function closeDialog() {
    // Remove the modal before focusing: while it is open the rest of the page is inert. After an awaited
    // save, a deferred render could otherwise run after a scheduled focus and drop it.
    flushSync(() => {
      setAddingTo(null);
      setAddingList(false);
    });
    addTrigger.current?.focus();
  }
  async function addCard(columnId: string, id: string, title: string, details: string) {
    const error = await saveCommand({ type: "add", columnId, card: { id, title, details } });
    if (!error) closeDialog();
    return error;
  }
  async function createList(listId: string, name: string) {
    createdList.current = listId;
    const error = await saveCommand({ type: "create-list", listId, name });
    if (error) createdList.current = null;
    else closeDialog();
    return error;
  }
  function deleteCard({ card, columnId }: { card: Card; columnId: string }) {
    deletedCardColumn.current = columnId;
    setDeletingCard(null);
    dispatch({ type: "delete", cardId: card.id });
  }
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
  const saveStatus = storage.saving ? "Saving..." : !storage.available ? "Disconnected" : storage.error ? "Save error" : "Saved";

  if (!storage.snapshot) {
    return <main className="board-loading">
      <h1>Forma</h1>
      {storage.loading ? <p role="status">Loading your board...</p> : <>
        <p role="alert">{storage.error}</p>
        <button className="primary-button" onClick={() => void storage.load()}>Retry loading board</button>
      </>}
    </main>;
  }

  return <div className={`app-shell${assistantCollapsed ? " assistant-collapsed" : ""}`}>
    <header className="topbar">
      <div className="brand" aria-label="Forma">
        <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
        forma<span className="brand-period">.</span>
      </div>
      <button
        type="button"
        ref={assistantLauncher}
        className="secondary-button assistant-toggle"
        aria-expanded={assistantOpen}
        aria-controls="board-assistant"
        onClick={openAssistant}
      >
        <Bot size={17} aria-hidden="true" /> AI Assistant
      </button>
    </header>
    <main>
      <div className="board-toolbar">
        <div className="board-label"><LayoutGrid size={19} aria-hidden="true" /><h1>Project board</h1></div>
        <span className="save-status" aria-live="polite">{saveStatus}</span>
        <button className="primary-button add-list" aria-disabled={busy || activeId !== null} onClick={openAddList}>
          Add list <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      {storage.error && <div className="storage-error">
        <p role="alert">{storage.error}</p>
        <button className="secondary-button" disabled={storage.loading || storage.saving} onClick={() => void storage.load()}>Reload board</button>
      </div>}
      <DndContext
        id="project-board"
        sensors={sensors}
        collisionDetection={args => boardCollisionDetection(args, boardViewport.current?.getBoundingClientRect(), new DOMRect(0, 0, window.innerWidth, window.innerHeight))}
        onDragStart={event => setActiveId(String(event.active.id))}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: dragInstructions } }}
      >
        <div ref={boardViewport} className="board-scroll" aria-label="Project board columns" tabIndex={0}>
          <div ref={laneGrid} className="board-grid">{boardLanes(board, laneCount).map((lane, laneIndex) => <div key={laneIndex} className="board-lane">
            {lane.map(({ list: column, index }) => <BoardColumn
            key={column.id}
            column={column}
            index={index}
            busy={busy}
            onAdd={trigger => { addTrigger.current = trigger; setAddingTo(column.id); }}
            onDelete={(card, trigger) => { addTrigger.current = trigger; setDeletingCard({ card, columnId: column.id }); }}
            onDeleteList={trigger => { addTrigger.current = trigger; setDeletingList(column); }}
            onRename={name => saveCommand({ type: "rename", columnId: column.id, name: name.trim() })}
            onEdit={(cardId, changes) => saveCommand({ type: "edit", cardId, ...changes })}
            onPriority={(cardId, priority) => dispatch({ type: "set-priority", cardId, priority })}
            />)}
          </div>)}</div>
          {!board.length && <div className="empty-board"><Columns3 size={25} /><p>Add a list to get started.</p></div>}
        </div>
        <DragOverlay>{activeCard && <CardDragPreview card={activeCard} />}</DragOverlay>
      </DndContext>
      <AssistantChat
        drawerOpen={assistantOpen}
        onCloseDrawer={() => setAssistantOpen(false)}
        collapsed={assistantCollapsed}
        onCollapse={() => collapseAssistant(true, () => assistantLauncher.current?.focus())}
        board={board}
        revision={storage.snapshot.revision}
        disabled={busy}
        onRefresh={() => void storage.load()}
        onApply={applyAssistant}
      />
    </main>
    {addingColumn && <AddItemDialog
      columnName={addingColumn.name}
      onClose={closeDialog}
      onAdd={(id, title, details) => addCard(addingColumn.id, id, title, details)}
    />}
    {addingList && <AddItemDialog onClose={closeDialog} onAdd={(listId, name) => createList(listId, name)} />}
    {deletingCard && <DeleteCardDialog card={deletingCard.card} onClose={cancelDelete} onDelete={() => deleteCard(deletingCard)} />}
    {deletingList && <DeleteListDialog columns={[deletingList]} onClose={cancelDelete} onDelete={() => deleteList(deletingList)} />}
  </div>;
}
