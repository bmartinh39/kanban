"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Send, Sparkles } from "lucide-react";
import { parsePlan, type AssistantPlan, type ChatMessage } from "./assistant-commands";
import type { Column } from "./board-state";
import { validRevision } from "./board-commands";

export function AssistantChat({ board, revision, disabled, onRefresh, onApply }: { board: Column[]; revision: number; disabled: boolean; onRefresh: () => void; onApply: (snapshot: Column[], plan: AssistantPlan, revision: number) => Promise<string> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy, error]);
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
      const message = await onApply(snapshot, parsePlan(result), result.revision);
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
  return <section id="board-assistant" className="assistant-panel" aria-label="Board assistant">
      <header className="assistant-heading"><span className="assistant-avatar" aria-hidden="true"><Bot size={25} /></span><div><span className="eyebrow"><Sparkles size={12} aria-hidden="true" /> AI ASSISTANT</span><h2>Board assistant</h2></div></header>
      <p className="assistant-context">Working with your open board. Ask me to create, edit, or move a card.</p>
      <div ref={log} className="assistant-log" role="log" aria-label="Assistant conversation" aria-live="polite">
        {!messages.length && <div className="assistant-welcome"><Bot size={32} aria-hidden="true" /><p>A small step starts here.</p><span>Try: Create a card called “Review the launch” in Planned.</span></div>}
        {messages.map((message, index) => <div key={index} className={`chat-message chat-${message.role}`}><span>{message.role === "user" ? "You" : "Assistant"}</span><p>{message.content}</p></div>)}
        {busy && <p role="status" className="assistant-working">Thinking about your board...</p>}
      </div>
      {error && <p role="alert" className="assistant-error">{error}</p>}
      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor="assistant-request">What would you like to change?</label>
        <textarea id="assistant-request" value={draft} maxLength={4000} rows={3} placeholder="Tell me what needs to happen..." onChange={event => setDraft(event.target.value)} />
        <div><span>Board changes are saved.</span><button className="primary-button" disabled={busy || disabled || !draft.trim()}>Send <Send size={14} /></button></div>
      </form>
    </section>;
}
