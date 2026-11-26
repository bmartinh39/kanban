import { boardReducer, cardPriorities, type BoardCommand, type Column } from "./board-state";
import { batchLimit, fieldCharacterLimit, idCharacterLimit, laneLimit } from "./limits";
import { isListColor } from "./list-colors";

export type BoardSnapshot = { columns: Column[]; revision: number };

export class InvalidCommand extends Error {}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length <= fieldCharacterLimit;
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= idCharacterLimit;
const validPriority = (value: unknown) => cardPriorities.some(priority => priority === value);
const count = (value: unknown, below = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < below;
export const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

export function parseCommands(value: unknown): BoardCommand[] {
  if (!Array.isArray(value) || value.length > batchLimit) throw new InvalidCommand(`Send at most ${batchLimit} board actions.`);
  for (const action of value) {
    if (!record(action) || !validCommand(action)) throw new InvalidCommand("Invalid board action.");
  }
  return value as BoardCommand[];
}

function validCommand(action: Record<string, unknown>) {
  switch (action.type) {
    case "create-list": return id(action.listId) && text(action.name) && isListColor(action.color) && count(action.lane, laneLimit);
    case "delete-list": return id(action.columnId);
    case "move-list": return id(action.columnId) && count(action.lane, laneLimit) && count(action.index);
    case "rename": return id(action.columnId) && text(action.name);
    case "delete": return id(action.cardId);
    case "set-priority": return id(action.cardId) && (action.priority === null || validPriority(action.priority));
    case "add": {
      const card = action.card;
      return id(action.columnId) && record(card) && id(card.id) && text(card.title) && text(card.details) &&
        (card.priority === undefined || validPriority(card.priority));
    }
    case "edit":
      return id(action.cardId) && (action.title !== undefined || action.details !== undefined) &&
        (action.title === undefined || text(action.title)) && (action.details === undefined || text(action.details));
    case "move":
      return id(action.cardId) && id(action.columnId) &&
        (action.index === undefined || (Number.isSafeInteger(action.index) && (action.index as number) >= 0));
    default: return false;
  }
}

export function applyCommands(board: Column[], actions: BoardCommand[]): Column[] {
  return actions.reduce((current, action) => {
    if (action.type === "create-list" && current.some(column => column.id === action.listId || column.cards.some(card => card.id === action.listId))) throw new InvalidCommand("This list ID is already in use.");
    if ("columnId" in action && !current.some(column => column.id === action.columnId)) throw new InvalidCommand("The target column no longer exists.");
    if ("cardId" in action && !current.some(column => column.cards.some(card => card.id === action.cardId))) throw new InvalidCommand("The target card no longer exists.");
    if (action.type === "add" && current.some(column => column.id === action.card.id || column.cards.some(card => card.id === action.card.id))) throw new InvalidCommand("This card ID is already in use.");
    if ((action.type === "add" && !action.card.title.trim()) || (action.type === "edit" && action.title !== undefined && !action.title.trim()) ||
      ((action.type === "rename" || action.type === "create-list") && !action.name.trim())) throw new InvalidCommand("Titles and column names cannot be blank.");
    if (action.type === "move-list" && action.index > current.filter(column => column.lane === action.lane && column.id !== action.columnId).length) throw new InvalidCommand("Invalid list position.");
    if (action.type === "move" && action.index !== undefined) {
      const destination = current.find(column => column.id === action.columnId)!;
      const max = destination.cards.length - (destination.cards.some(card => card.id === action.cardId) ? 1 : 0);
      if (action.index > max) throw new InvalidCommand("Invalid card position.");
    }
    return boardReducer(current, action);
  }, board);
}
