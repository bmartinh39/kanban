import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cardPriorities, type Card, type CardPriority } from "./board-state";

const priorityLabels: Record<CardPriority, string> = {
  low: "Low",
  normal: "Normal",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
  critical: "Critical",
};
const priorityOptions: readonly (CardPriority | null)[] = [null, ...cardPriorities];

export function CardPriorityButton({ card, busy, onChange }: {
  card: Card;
  busy: boolean;
  onChange: (priority: CardPriority | null) => Promise<void>;
}) {
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pendingPriority, setPendingPriority] = useState<CardPriority | null>();
  const priority = pendingPriority === undefined ? card.priority : pendingPriority ?? undefined;
  const disabled = busy || pendingPriority !== undefined;

  useLayoutEffect(() => {
    if (!open) return;
    const menu = popup.current!;
    const button = trigger.current!;
    function positionMenu() {
      const anchor = button.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = menu;
      const { clientWidth, clientHeight } = document.documentElement;
      const left = Math.min(Math.max(8, anchor.left + (anchor.width - width) / 2), clientWidth - width - 8);
      const below = anchor.bottom + 5;
      const top = below + height <= clientHeight - 8 ? below : anchor.top - height - 5;
      menu.style.left = `${left}px`;
      menu.style.top = `${Math.max(8, top)}px`;
    }
    positionMenu();
    menu.style.visibility = "visible";
    (menu.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menu.querySelector("button"))?.focus({ preventScroll: true });
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, { passive: true });
    return () => {
      menu.style.visibility = "";
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu);
    };
  }, [open]);

  function handleMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      event.currentTarget.hidePopover();
      return;
    }
    const options = Array.from(event.currentTarget.querySelectorAll("button"));
    const index = options.findIndex(option => option === event.target);
    const next = event.key === "ArrowDown" ? (index + 1) % options.length
      : event.key === "ArrowUp" ? (index - 1 + options.length) % options.length
      : event.key === "Home" ? 0
      : event.key === "End" ? options.length - 1
      : undefined;
    if (next === undefined) return;
    event.preventDefault();
    options[next].focus();
  }

  async function choose(next: CardPriority | null) {
    popup.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
    if (disabled || next === (priority ?? null)) return;
    setPendingPriority(next);
    try { await onChange(next); }
    finally { setPendingPriority(undefined); }
  }

  return <>
    <button type="button" ref={trigger} className="priority-bar" data-priority={priority} popoverTarget={menuId}
      aria-label={`Priority for ${card.title}: ${priority ? priorityLabels[priority] : "None"}`}
      aria-haspopup="menu" aria-expanded={open} aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    <div id={menuId} ref={popup} className="priority-menu" popover="auto" role="menu" aria-label={`Priority for ${card.title}`}
      onToggle={event => setOpen(event.newState === "open")} onKeyDown={handleMenuKey}>
      {priorityOptions.map(option => <button type="button" key={option ?? "none"} role="menuitemradio" tabIndex={-1}
        aria-checked={(priority ?? null) === option} onClick={() => void choose(option)}>
        <span className="priority-swatch" data-priority={option ?? undefined} aria-hidden="true" />
        {option === null ? "No priority" : priorityLabels[option]}
        {(priority ?? null) === option && <Check size={14} aria-hidden="true" />}
      </button>)}
    </div>
  </>;
}
