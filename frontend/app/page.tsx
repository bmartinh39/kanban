"use client";

import { useEffect, useId, useReducer, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { ArrowDownRight, ArrowUpRight, Check, Columns3, GripVertical, LayoutGrid, Pencil, Plus, Trash2, X } from "lucide-react";
import { columnCoordinates } from "./keyboard-coordinates";
import { boardReducer, initialBoard, type Card, type Column } from "./board-state";


function CardContent({ card }: { card: Card }) {
  return <><h3>{card.title}</h3>{card.details && <p>{card.details}</p>}</>;
}

function TaskCard({ card, onDelete }: { card: Card; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return <article ref={setNodeRef} className={`task-card${isDragging ? " is-dragging" : ""}`} data-testid={`card-${card.id}`}>
    <div className="card-tools">
      <button className="icon-button drag-handle" {...attributes} {...listeners} aria-label={`Move ${card.title}`}><GripVertical size={16} /></button>
      <button className="icon-button delete-button" onClick={onDelete} aria-label={`Delete ${card.title}`}><Trash2 size={14} /></button>
    </div>
    <CardContent card={card} />
  </article>;
}

function BoardColumn({ column, index, onAdd, onDelete, onRename }: { column: Column; index: number; onAdd: (trigger: HTMLButtonElement) => void; onDelete: (id: string) => void; onRename: (name: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const renameButton = useRef<HTMLButtonElement>(null);
  function finishRename(save: boolean) {
    if (save && !name.trim()) return;
    if (save) onRename(name);
    setRenaming(false);
    requestAnimationFrame(() => renameButton.current?.focus());
  }
  return <section className={`column column-${index}${isOver ? " is-over" : ""}`} aria-label={`${column.name} column`} ref={setNodeRef}>
    <header className="column-header">
      <span className="status-dot" />
      {renaming ? <form className="rename-form" onSubmit={event => { event.preventDefault(); finishRename(true); }}>
        <input autoFocus aria-label="Column name" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Escape") finishRename(false); }} />
        <button className="icon-button" disabled={!name.trim()} aria-label="Save column name"><Check size={15} /></button>
        <button type="button" className="icon-button" aria-label="Cancel rename" onClick={() => finishRename(false)}><X size={15} /></button>
      </form> : <><h2>{column.name}</h2><span className="column-count">{column.cards.length}</span><button ref={renameButton} className="icon-button rename-button" aria-label={`Rename ${column.name}`} onClick={() => { setName(column.name); setRenaming(true); }}><Pencil size={13} /></button></>}
    </header>
    <div className="card-stack">
      {column.cards.map(card => <TaskCard key={card.id} card={card} onDelete={() => onDelete(card.id)} />)}
      {!column.cards.length && <div className="empty-column"><Columns3 size={23} /><p>A little room for what&apos;s next.</p><span>Drop a card here or add one below.</span></div>}
    </div>
    <button className="add-card" onClick={event => onAdd(event.currentTarget)}><Plus size={16} /> Add a card</button>
  </section>;
}

function AddCardDialog({ columnName, onClose, onAdd }: { columnName: string; onClose: () => void; onAdd: (title: string, details: string) => void }) {
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
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>(":is(button, input, textarea):not(:disabled)");
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (title.trim()) onAdd(title, details); }}>
      <div className="dialog-heading"><div><span className="eyebrow">A NEW POSSIBILITY</span><h2 id={titleId}>Add a card</h2></div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>
      <p className="dialog-subtitle">A place in <strong>{columnName}</strong> for your next idea.</p>
      <label htmlFor="card-title">Title <span className="required-label">Required</span></label>
      <input id="card-title" ref={titleInput} placeholder="What needs to happen?" value={title} onChange={event => setTitle(event.target.value)} required />
      <label htmlFor="card-details">Details <span className="optional-label">Optional</span></label>
      <textarea id="card-details" placeholder="A little context goes a long way..." value={details} onChange={event => setDetails(event.target.value)} rows={4} />
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim()}>Add card <Plus size={16} /></button></div>
    </form>
  </dialog>;
}

export default function Home() {
  const [board, dispatch] = useReducer(boardReducer, initialBoard);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const addTrigger = useRef<HTMLButtonElement>(null);
  function closeDialog() {
    setAddingTo(null);
    requestAnimationFrame(() => addTrigger.current?.focus());
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: columnCoordinates, scrollBehavior: "auto" }));
  const activeCard = board.flatMap(column => column.cards).find(card => card.id === activeId);
  const total = board.reduce((sum, column) => sum + column.cards.length, 0);
  const addingColumn = board.find(column => column.id === addingTo);
  return <div className="app-shell">
    <header className="topbar"><div className="brand" aria-label="Forma"><span className="brand-mark"><span /><span /><span /><span /></span>forma<span className="brand-period">.</span></div><div className="workspace-label"><span /> Your creative workspace</div><span className="edition">A little clarity, every day.</span></header>
    <main>
      <section className="intro"><div className="intro-copy"><div className="eyebrow"><span className="small-line" /> LESS NOISE. MORE FLOW.</div><h1>The work, in view<span>.</span></h1><p>Big ideas meet small steps. Make space for what&apos;s next.</p></div><div className="intro-note"><ArrowDownRight size={25} strokeWidth={1.4} /><span>A clear head starts<br />with a clear board.</span></div></section>
      <div className="board-toolbar"><div className="board-label"><LayoutGrid size={17} /><h2>Project board</h2><span className="live-dot" /></div><div className="board-summary"><span>{total} cards</span><span className="summary-separator" /><span>5 stages</span></div></div>
      <DndContext id="project-board" sensors={sensors} collisionDetection={args => { return args.pointerCoordinates ? pointerWithin(args) : closestCenter(args); }} onDragStart={event => setActiveId(String(event.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={event => { if (event.over) dispatch({ type: "move", cardId: String(event.active.id), columnId: String(event.over.id) }); setActiveId(null); }} accessibility={{ screenReaderInstructions: { draggable: "Press Space to pick up a card. Use the left and right arrow keys to move between columns. Press Space to drop, or Escape to cancel." } }}>
        <div className="board-scroll" aria-label="Project board columns" tabIndex={0}><div className="board-grid">{board.map((column, index) => <BoardColumn key={column.id} column={column} index={index} onAdd={trigger => { addTrigger.current = trigger; setAddingTo(column.id); }} onDelete={cardId => dispatch({ type: "delete", cardId })} onRename={name => dispatch({ type: "rename", columnId: column.id, name })} />)}</div></div>
        <DragOverlay>{activeCard && <div className="task-card drag-preview"><div className="card-tools"><GripVertical size={16} /></div><CardContent card={activeCard} /></div>}</DragOverlay>
      </DndContext>
      <footer className="board-footer"><span><GripVertical size={14} /> Grab a handle. Find a new perspective.</span><span>Built for a little forward motion <ArrowUpRight size={14} /></span></footer>
    </main>
    {addingColumn && <AddCardDialog columnName={addingColumn.name} onClose={closeDialog} onAdd={(title, details) => { dispatch({ type: "add", columnId: addingColumn.id, card: { id: crypto.randomUUID(), title, details } }); closeDialog(); }} />}
  </div>;
}
