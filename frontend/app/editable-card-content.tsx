import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import type { Card } from "./board-state";
import { fieldCharacterLimit } from "./limits";

type Field = "title" | "details";

function fitHeight(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

// The title and details become borderless, transparent text areas in place (issue #43). Clicking either
// field edits both with the caret where the user clicked; leaving the card text, Enter in the title, or
// Ctrl/Cmd+Enter saves, and Escape cancels. The draft stays open until the save is confirmed.
export function EditableCardContent({ card, busy, onSave }: {
  card: Card;
  busy: boolean;
  /** Resolves to an error message, or null once saved. */
  onSave: (changes: { title?: string; details?: string }) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<{ title: string; details: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const content = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ field: Field; offset: number } | null>(null);
  const editedField = useRef<Field>("title");

  useLayoutEffect(() => {
    const editors = content.current!.querySelectorAll<HTMLTextAreaElement>(".card-editor");
    editors.forEach(fitHeight);
    if (!editors.length || !pendingFocus.current) return;
    const { field, offset } = pendingFocus.current;
    pendingFocus.current = null;
    const editor = editors[field === "title" ? 0 : 1];
    editor.focus();
    editor.setSelectionRange(offset, offset);
  });

  function start(field: Field, offset = card[field].length) {
    if (busy || draft) return;
    editedField.current = field;
    pendingFocus.current = { field, offset };
    setDraft({ title: card.title, details: card.details });
  }

  function startFromClick(field: Field, event: MouseEvent<HTMLElement>) {
    const selection = window.getSelection();
    // A drag that selected text is left alone so the text can still be copied.
    if (selection && !selection.isCollapsed) return;
    const inside = selection?.anchorNode && event.currentTarget.contains(selection.anchorNode);
    start(field, inside ? selection.anchorOffset : undefined);
  }

  async function finish(save: boolean, returnFocus: boolean) {
    if (!draft || saving) return;
    const changes = {
      ...(draft.title.trim() && draft.title !== card.title ? { title: draft.title } : {}),
      ...(draft.details !== card.details ? { details: draft.details } : {}),
    };
    if (save && Object.keys(changes).length) {
      setSaving(true);
      const failure = await onSave(changes);
      setSaving(false);
      if (failure) {
        setError(failure);
        return;
      }
    }
    // Render the text again before focusing it; after an awaited save a deferred render could drop the focus.
    flushSync(() => {
      setError("");
      setDraft(null);
    });
    if (returnFocus) content.current?.querySelector<HTMLElement>(`[data-field="${editedField.current}"]`)?.focus({ preventScroll: true });
  }

  function handleEditorKey(field: Field, event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      void finish(false, true);
    } else if (event.key === "Enter" && (field === "title" ? !event.shiftKey : event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void finish(true, true);
    }
  }

  function handleReaderKey(field: Field, event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== "F2") return;
    event.preventDefault();
    start(field);
  }

  if (!draft) {
    return <div ref={content} className="card-content">
      <h3 className="editable-text" data-field="title" tabIndex={busy ? -1 : 0}
        onClick={event => startFromClick("title", event)} onKeyDown={event => handleReaderKey("title", event)}>{card.title}</h3>
      {card.details && <p className="editable-text" data-field="details" tabIndex={busy ? -1 : 0}
        onClick={event => startFromClick("details", event)} onKeyDown={event => handleReaderKey("details", event)}>{card.details}</p>}
    </div>;
  }
  const editor = (field: Field, label: string) => <textarea className="card-editor" rows={1} aria-label={label}
    value={draft[field]} maxLength={fieldCharacterLimit} readOnly={saving} placeholder={field === "details" ? "Add details" : undefined}
    onChange={event => { setDraft({ ...draft, [field]: event.target.value }); fitHeight(event.target); }}
    onKeyDown={event => handleEditorKey(field, event)} />;
  return <div ref={content} className="card-content is-editing"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) void finish(true, false); }}>
    <h3>{editor("title", `Title for ${card.title}`)}</h3>
    <p>{editor("details", `Details for ${card.title}`)}</p>
    {error && <p role="alert" className="form-error card-edit-error">{error}</p>}
  </div>;
}
