import { boardReducer, cardPriorities, type Action, type Column } from "./board-state";

export type BoardCommand = Exclude<Action, { type: "assistant" }>;
export type BoardSnapshot = { columns: Column[]; revision: number };

export class InvalidCommand extends Error {}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 20_000;
const id = (value: unknown): value is string => text(value) && value.length > 0 && value.length <= 100;
const validPriority = (value: unknown) => cardPriorities.some(priority => priority === value);
export const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function parseCommands(value: unknown): BoardCommand[] {
  if (!Array.isArray(value) || value.length > 20) throw new InvalidCommand("Send at most 20 board actions.");
  for (const action of value) {
    if (!record(action)) throw new InvalidCommand("Invalid board action.");
    const valid = action.type === "create-list" ? id(action.listId) && text(action.name)
      : action.type === "delete-list" ? id(action.columnId)
      : action.type === "add" ? id(action.columnId) && record(action.card) && id(action.card.id) && text(action.card.title) && text(action.card.details) &&
        (action.card.priority === undefined || validPriority(action.card.priority))
      : action.type === "delete" ? id(action.cardId)
      : action.type === "set-priority" ? id(action.cardId) && validPriority(action.priority)
      : action.type === "rename" ? id(action.columnId) && text(action.name)
      : action.type === "edit" ? id(action.cardId) && (action.title !== undefined || action.details !== undefined) &&
        (action.title === undefined || text(action.title)) && (action.details === undefined || text(action.details))
      : action.type === "move" ? id(action.cardId) && id(action.columnId) &&
        (action.index === undefined || (Number.isSafeInteger(action.index) && (action.index as number) >= 0))
      : false;
    if (!valid) throw new InvalidCommand("Invalid board action.");
  }
  return value as BoardCommand[];
}

export function applyCommands(board: Column[], actions: BoardCommand[]): Column[] {
  return actions.reduce((current, action) => {
    if (action.type === "create-list" && current.some(column => column.id === action.listId || column.cards.some(card => card.id === action.listId))) throw new InvalidCommand("This list ID is already in use.");
    if ("columnId" in action && !current.some(column => column.id === action.columnId)) throw new InvalidCommand("The target column no longer exists.");
    if ("cardId" in action && !current.some(column => column.cards.some(card => card.id === action.cardId))) throw new InvalidCommand("The target card no longer exists.");
    if (action.type === "add" && current.some(column => column.id === action.card.id || column.cards.some(card => card.id === action.card.id))) throw new InvalidCommand("This card ID is already in use.");
    if ((action.type === "add" && !action.card.title.trim()) || (action.type === "edit" && action.title !== undefined && !action.title.trim()) ||
      ((action.type === "rename" || action.type === "create-list") && !action.name.trim())) throw new InvalidCommand("Titles and column names cannot be blank.");
    if (action.type === "move" && action.index !== undefined) {
      const destination = current.find(column => column.id === action.columnId)!;
      const max = destination.cards.length - (destination.cards.some(card => card.id === action.cardId) ? 1 : 0);
      if (action.index > max) throw new InvalidCommand("Invalid card position.");
    }
    return boardReducer(current, action);
  }, board);
}
