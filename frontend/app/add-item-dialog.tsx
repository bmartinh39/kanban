import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { fieldCharacterLimit } from "./limits";

type AddItemDialogProps = {
  /** The target list for a new card; omitted when creating a list. */
  columnName?: string;
  onClose: () => void;
  /** Saves with a stable ID; resolves to an error message, or null once saved. */
  onAdd: (id: string, title: string, details: string) => Promise<string | null>;
};

/** Keeps Tab focus inside the modal. */
function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = event.currentTarget.querySelectorAll<HTMLElement>(":is(button, input, textarea):not(:disabled)");
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function AddItemDialog({ columnName, onClose, onAdd }: AddItemDialogProps) {
  const isList = columnName === undefined;
  // Reused on retry, so a save that committed despite an error cannot be duplicated.
  const [id] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const errorId = useId();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);

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
    // The dialog stays open with its draft until the save is confirmed.
    const failure = await onAdd(id, title, details);
    if (failure) {
      setSaving(false);
      setError(failure);
    }
  }

  return <dialog
    ref={dialog}
    aria-labelledby={titleId}
    onCancel={event => { if (saving) event.preventDefault(); else onClose(); }}
    onKeyDown={trapFocus}
    onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}
  >
    <form aria-describedby={error ? errorId : undefined} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="dialog-heading">
        <h2 id={titleId}>{isList ? "Add a list" : "Add a card"}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
      </div>
      {!isList && <p className="dialog-subtitle">List <strong>{columnName}</strong></p>}
      <label htmlFor="item-title">{isList ? "List name" : "Title"} <span className="required-label">Required</span></label>
      <input
        id="item-title"
        ref={titleInput}
        placeholder={isList ? "What is this stage called?" : "What needs to happen?"}
        value={title}
        onChange={event => setTitle(event.target.value)}
        maxLength={fieldCharacterLimit}
        required
      />
      {!isList && <>
        <label htmlFor="card-details">Details <span className="optional-label">Optional</span></label>
        <textarea
          id="card-details"
          placeholder="A little context goes a long way..."
          value={details}
          onChange={event => setDetails(event.target.value)}
          maxLength={fieldCharacterLimit}
          rows={4}
        />
      </>}
      {error && <p role="alert" id={errorId} className="form-error">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
        <button className="primary-button" disabled={!title.trim() || saving}>
          {saving ? "Saving..." : isList ? "Create list" : "Add card"} <Plus size={16} />
        </button>
      </div>
    </form>
  </dialog>;
}
