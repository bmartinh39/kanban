"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Card, Column } from "./board-state";

function DeleteConfirmationDialog({ title, children, confirmLabel, onClose, onDelete }: { title: string; children: ReactNode; confirmLabel: string; onClose: () => void; onDelete: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [closing, setClosing] = useState<"cancel" | "delete" | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    cancel.current!.focus();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (!closing) return;
    const element = dialog.current!;
    let cancelled = false;
    void Promise.allSettled(element.getAnimations().map(animation => animation.finished)).then(() => {
      if (cancelled) return;
      element.close();
      if (closing === "delete") onDelete(); else onClose();
    });
    return () => { cancelled = true; };
  }, [closing, onClose, onDelete]);
  return <dialog ref={dialog} className={`delete-confirmation${closing ? " is-closing" : ""}`} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); if (!closing) setClosing("cancel"); }} onClick={event => { if (event.target === event.currentTarget && !closing) setClosing("cancel"); }}>
    <h2 id={titleId}>{title}</h2>
    <button type="button" className="icon-button dialog-close" disabled={!!closing} aria-label="Close dialog" onClick={() => setClosing("cancel")}><X size={20} /></button>
    <div id={descriptionId} className="dialog-subtitle">{children}</div>
    <div className="dialog-actions"><button ref={cancel} className="secondary-button" disabled={!!closing} onClick={() => setClosing("cancel")}>Cancel</button><button className="primary-button danger-button" disabled={!!closing} onClick={() => setClosing("delete")}>{confirmLabel}</button></div>
  </dialog>;
}

export function DeleteListDialog({ columns, batch = false, onClose, onDelete }: { columns: Column[]; batch?: boolean; onClose: () => void; onDelete: () => void }) {
  return <DeleteConfirmationDialog title={columns.length === 1 ? "Delete this list?" : "Delete these lists?"} confirmLabel={columns.length === 1 ? "Delete list" : "Delete lists"} onClose={onClose} onDelete={onDelete}>
    {columns.map(column => <p key={column.id}>{column.cards.length ? <>Deleting <strong>{column.name}</strong> also deletes its {column.cards.length} {column.cards.length === 1 ? "card" : "cards"}.</> : <>Delete the empty list <strong>{column.name}</strong>?</>}</p>)}<p>This cannot be undone.{batch && " Other changes in this request will be saved together. Cancel keeps the entire board unchanged."}</p>
  </DeleteConfirmationDialog>;
}

export function DeleteCardDialog({ card, onClose, onDelete }: { card: Card; onClose: () => void; onDelete: () => void }) {
  return <DeleteConfirmationDialog title="Delete this card?" confirmLabel="Delete card" onClose={onClose} onDelete={onDelete}>
    <p>Delete <strong>{card.title}</strong>?</p><p>This cannot be undone.</p>
  </DeleteConfirmationDialog>;
}
