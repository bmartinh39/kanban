import type { Column } from "./board-state";
import { applyCommands, parseCommands } from "./board-commands";
import type { BoardCommand } from "./board-state";
import { nextListColor } from "./list-colors";
import { batchLimit, chatHistoryByteLimit, chatHistoryLimit, chatMessageCharacterLimit, clip, nameDisplayLimit, utf8Bytes } from "./limits";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export const operationTypes = ["create", "edit", "move", "create-list", "rename-list", "delete-list"] as const;
const listOperationTypes: readonly string[] = ["create-list", "rename-list", "delete-list"] satisfies AssistantOperation["type"][];
export type AssistantOperation = {
  type: typeof operationTypes[number];
  list: string | null;
  sourceList: string | null;
  card: string | null;
  title: string | null;
  details: string | null;
};
export type AssistantPlan = { message: string; operations: AssistantOperation[] };

const nullableString = { type: ["string", "null"] };
export const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message", "operations"],
  properties: {
    message: { type: "string" },
    operations: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["type", "list", "sourceList", "card", "title", "details"],
      properties: {
        type: { type: "string", enum: operationTypes },
        list: nullableString, sourceList: nullableString, card: nullableString,
        title: nullableString, details: nullableString,
      },
    } },
  },
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePlan(value: unknown): AssistantPlan {
  if (!isRecord(value) || typeof value.message !== "string" || !value.message.trim() ||
    !Array.isArray(value.operations) || value.operations.length > batchLimit) {
    throw new Error("The assistant returned an invalid response. No changes were made.");
  }
  const operations = value.operations.map(operation => {
    if (!isRecord(operation) || typeof operation.type !== "string" || !(operationTypes as readonly string[]).includes(operation.type) ||
      !["list", "sourceList", "card", "title", "details"].every(key =>
        operation[key] === null || typeof operation[key] === "string")) {
      throw new Error("The assistant returned an invalid action. No changes were made.");
    }
    return operation as AssistantOperation;
  });
  return { message: value.message, operations };
}

const normalized = (value: string) => value.trim().toLowerCase();
// Outcome messages quote names briefly so they stay valid chat history.
const quoted = (name: string) => `"${clip(name, nameDisplayLimit)}"`;

/** Recent messages for the provider: each clipped, newest kept, within the count and UTF-8 byte budgets. */
export function boundedHistory(messages: ChatMessage[]): ChatMessage[] {
  const history: ChatMessage[] = [];
  let bytes = 0;
  for (const message of messages.slice(-chatHistoryLimit).reverse()) {
    const content = clip(message.content.trim(), chatMessageCharacterLimit);
    bytes += utf8Bytes(content);
    if (bytes > chatHistoryByteLimit || !content) break;
    history.unshift({ role: message.role, content });
  }
  // The provider conversation must start after a complete exchange and end with the user's request.
  while (history.length > 1 && history[0].role === "assistant") history.shift();
  return history;
}

// Resolve every target against the snapshot before dispatching any actions.
export function prepareActions(board: Column[], plan: AssistantPlan): { actions: BoardCommand[]; message: string; deletedLists: Column[] } {
  const actions: BoardCommand[] = [];
  const outcomes: string[] = [];
  function findList(name: string | null) {
    const matches = name === null ? [] : board.filter(column => normalized(column.name) === normalized(name));
    if (matches.length !== 1) throw new Error(matches.length
      ? `More than one list is named ${quoted(name!)}. Rename a list to make the target clear. No changes were made.`
      : `List ${quoted(name ?? "")} was not found. Specify an existing list. No changes were made.`);
    return matches[0];
  }
  for (const operation of plan.operations) {
    if (listOperationTypes.includes(operation.type)) {
      if (operation.card !== null || operation.sourceList !== null || operation.details !== null ||
        (operation.type === "create-list" && operation.list !== null) ||
        (operation.type === "delete-list" && operation.title !== null)) throw new Error("The assistant returned an invalid list action. No changes were made.");
      if (operation.type !== "delete-list" && !operation.title?.trim()) throw new Error("Lists need a nonblank name. No changes were made.");
      if (operation.type === "create-list") {
        // The assistant does not choose colors; new lists take the next default color.
        const listCount = board.length + actions.filter(action => action.type === "create-list").length;
        actions.push({ type: "create-list", listId: crypto.randomUUID(), name: operation.title!.trim(), color: nextListColor(listCount) });
        outcomes.push(`Created list ${quoted(operation.title!.trim())}.`);
      } else {
        const column = findList(operation.list);
        if (operation.type === "rename-list") {
          actions.push({ type: "rename", columnId: column.id, name: operation.title!.trim() });
          outcomes.push(`Renamed list ${quoted(column.name)} to ${quoted(operation.title!.trim())}.`);
        } else {
          actions.push({ type: "delete-list", columnId: column.id });
          outcomes.push(`Deleted list ${quoted(column.name)} and its cards.`);
        }
      }
      continue;
    }
    if (operation.type === "create") {
      const column = findList(operation.list);
      if (!operation.title?.trim()) throw new Error("A new card needs a nonblank title. No changes were made.");
      actions.push({ type: "add", columnId: column.id, card: {
        id: crypto.randomUUID(), title: operation.title.trim(), details: operation.details?.trim() ?? "",
      } });
      outcomes.push(`Created ${quoted(operation.title.trim())} in ${clip(column.name, nameDisplayLimit)}.`);
      continue;
    }
    const source = operation.sourceList === null ? board : [findList(operation.sourceList)];
    const matches = source.flatMap(column => column.cards.filter(card =>
      operation.card !== null && normalized(card.title) === normalized(operation.card)));
    if (matches.length !== 1) throw new Error(matches.length
      ? `More than one card is named ${quoted(operation.card!)}. Specify its list; if both are in the same list, give them distinct titles. No changes were made.`
      : `Card ${quoted(operation.card ?? "")} was not found. Use its full title and list. No changes were made.`);
    const card = matches[0];
    if (operation.type === "move") {
      const column = findList(operation.list);
      actions.push({ type: "move", cardId: card.id, columnId: column.id });
      outcomes.push(`Moved ${quoted(card.title)} to ${clip(column.name, nameDisplayLimit)}.`);
    } else {
      if (operation.title === null && operation.details === null) throw new Error("Specify a title or details to edit. No changes were made.");
      if (operation.title !== null && !operation.title.trim()) throw new Error("Card titles cannot be blank. No changes were made.");
      actions.push({ type: "edit", cardId: card.id, title: operation.title ?? undefined, details: operation.details ?? undefined });
      outcomes.push(`Updated ${quoted(operation.title?.trim() ?? card.title)}.`);
    }
  }
  const deletedLists: Column[] = [];
  let preview = board;
  try {
    parseCommands(actions);
    for (const action of actions) {
      if (action.type === "delete-list") {
        const column = preview.find(column => column.id === action.columnId);
        if (column) deletedLists.push(column);
      }
      preview = applyCommands(preview, [action]);
    }
  } catch {
    throw new Error("These actions conflict with one another. Send separate requests. No changes were made.");
  }
  return { actions, message: outcomes.length ? outcomes.join("\n") : plan.message, deletedLists };
}
