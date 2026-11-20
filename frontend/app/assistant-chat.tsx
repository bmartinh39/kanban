"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, X } from "lucide-react";
import { parsePlan, prepareActions, type AssistantPlan, type ChatMessage } from "./assistant-commands";
import { DeleteListDialog } from "./delete-list-dialog";
import type { Column } from "./board-state";
import { validRevision } from "./board-commands";

export function AssistantChat({ open, board, revision, disabled, onClose, onRefresh, onApply }: { open: boolean; board: Column[]; revision: number; disabled: boolean; onClose: () => void; onRefresh: () => void; onApply: (snapshot: Column[], plan: AssistantPlan, revision: number) => Promise<string> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ columns: Column[]; batch: boolean; resolve: (confirmed: boolean) => void } | null>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const isModal = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useLayoutEffect(() => {
    const element = panel.current!;
    const narrow = window.matchMedia("(max-width: 700px)");
    function syncPanel() {
      if (!open) {
        if (element.open) element.close();
        return;
      }
      // Keep the confirmation above the assistant in the browser's dialog stack.
      if (element.open && (isModal.current === narrow.matches || confirmation)) return;
      const focused = element.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
      if (element.open) element.close();
      if (narrow.matches) element.showModal(); else element.show();
      isModal.current = narrow.matches;
      focused?.focus({ preventScroll: true });
    }
    syncPanel();
    narrow.addEventListener("change", syncPanel);
    return () => narrow.removeEventListener("change", syncPanel);
  }, [open, confirmation]);
  useEffect(() => {
    if (open && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, messages, busy, error]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy || disabled) return;
    const snapshot = board;
    const conversation: ChatMessage[] = [...messages, { role: "user", content: draft.trim() }];
    setMessages(conversation);
    setDraft("");
    setError("");
    setBusy(true);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ revision, messages: conversation.slice(-19) }),
      });
      const result = await response.json();
      if (response.status === 409) onRefresh();
      if (!response.ok) throw new Error(result.error || "The assistant is unavailable. Try again.");
      if (!validRevision(result.revision) || result.revision !== revision) throw new Error("The board changed while I was thinking. Send your request again. No changes were made.");
      const plan = parsePlan(result);
      const { deletedLists } = prepareActions(snapshot, plan);
      if (deletedLists.length) {
        const confirmed = await new Promise<boolean>(resolve => setConfirmation({ columns: deletedLists, batch: plan.operations.some(operation => operation.type !== "delete-list"), resolve }));
        if (controller.signal.aborted) return;
        if (!confirmed) {
          setMessages([...conversation, { role: "assistant", content: "Cancelled. No changes were made." }]);
          return;
        }
      }
      const message = await onApply(snapshot, plan, result.revision);
      setMessages([...conversation, { role: "assistant", content: message }]);
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "Connection failed. Try again. No changes were made.");
        setDraft(conversation.at(-1)!.content);
      }
    } finally {
      setBusy(false);
      pending.current = null;
    }
  }
  function confirmDeletion(confirmed: boolean) {
    confirmation?.resolve(confirmed);
    setConfirmation(null);
    if (open) composer.current?.focus({ preventScroll: true });
  }
  return <>
    <dialog ref={panel} id="board-assistant" className="assistant-panel" aria-labelledby="assistant-heading" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
      if (event.target === event.currentTarget && isModal.current) onClose();
    }} onKeyDown={event => {
      if (event.key === "Escape" && !isModal.current) onClose();
    }}>
      <header className="assistant-heading">
        <Bot size={20} aria-hidden="true" />
        <h2 id="assistant-heading">AI Assistant</h2>
        <button type="button" className="icon-button" aria-label="Close assistant" onClick={onClose}><X size={19} aria-hidden="true" /></button>
      </header>
      <p className="assistant-context">Create, edit, or move cards. Create, rename, or delete lists. List deletion always asks for confirmation.</p>
      <div ref={log} className="assistant-log" role="log" aria-label="Assistant conversation" aria-live="polite">
        {messages.map((message, index) => <div key={index} className={`chat-message chat-${message.role}`}><span>{message.role === "user" ? "You" : "Assistant"}</span><p>{message.content}</p></div>)}
        {busy && <p role="status" className="assistant-working">{confirmation ? "Waiting for deletion confirmation..." : "Thinking about your board..."}</p>}
      </div>
      {error && <p role="alert" className="assistant-error">{error}</p>}
      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor="assistant-request">What would you like to change?</label>
        <textarea ref={composer} id="assistant-request" value={draft} maxLength={4000} rows={3} placeholder="Tell me what needs to happen..." onChange={event => setDraft(event.target.value)} onKeyDown={event => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          event.preventDefault();
          if (!event.repeat) event.currentTarget.form?.requestSubmit();
        }} />
        <div><button className="primary-button" disabled={busy || disabled || !draft.trim()}>Send <Send size={14} /></button></div>
      </form>
    </dialog>
    {confirmation && <DeleteListDialog columns={confirmation.columns} batch={confirmation.batch} onClose={() => confirmDeletion(false)} onDelete={() => confirmDeletion(true)} />}
  </>;
}
