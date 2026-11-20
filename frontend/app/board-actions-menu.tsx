"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Ellipsis } from "lucide-react";

type MenuAction = {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  onSelect: (trigger: HTMLButtonElement) => void;
};

export function BoardActionsMenu({ label, disabled, actions }: {
  label: string;
  disabled: boolean;
  actions: MenuAction[];
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const expanded = open && !disabled;

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function select(action: MenuAction) {
    const button = trigger.current;
    setOpen(false);
    if (!button) return;
    button.focus({ preventScroll: true });
    action.onSelect(button);
  }

  return <div ref={root} className="board-actions-menu" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (!expanded || event.key !== "Escape") return;
    event.stopPropagation();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }}>
    <button type="button" ref={trigger} className="icon-button menu-toggle" aria-label={label} aria-expanded={expanded} aria-controls={id} aria-disabled={disabled} onClick={() => {
      if (!disabled) setOpen(value => !value);
    }}><Ellipsis size={19} aria-hidden="true" /></button>
    <div className="board-action-items" id={id} hidden={!expanded}>
      {expanded && actions.map(action => <button type="button" key={action.label} className={action.danger ? "danger-action" : undefined} onClick={() => select(action)}>
        {action.icon} {action.label}
      </button>)}
    </div>
  </div>;
}
