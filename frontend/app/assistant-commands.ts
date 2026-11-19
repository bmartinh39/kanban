import type { Column } from "./board-state";
import { applyCommands, parseCommands, type BoardCommand } from "./board-commands";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type AssistantOperation = {
  type: "create" | "edit" | "move" | "create-list" | "rename-list" | "delete-list";
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
        type: { type: "string", enum: ["create", "edit", "move", "create-list", "rename-list", "delete-list"] },
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
    !Array.isArray(value.operations) || value.operations.length > 20) {
    throw new Error("The assistant returned an invalid response. No changes were made.");
  }
  const operations = value.operations.map(operation => {
    if (!isRecord(operation) || typeof operation.type !== "string" || !["create", "edit", "move", "create-list", "rename-list", "delete-list"].includes(operation.type) ||
      !["list", "sourceList", "card", "title", "details"].every(key =>
        operation[key] === null || typeof operation[key] === "string")) {
      throw new Error("The assistant returned an invalid action. No changes were made.");
    }
    return operation as AssistantOperation;
  });
  return { message: value.message, operations };
}

const normalized = (value: string) => value.trim().toLowerCase();

// Resolve every target against the snapshot before dispatching any actions.
export function prepareActions(board: Column[], plan: AssistantPlan): { actions: BoardCommand[]; message: string; deletedLists: Column[] } {
  const actions: BoardCommand[] = [];
  const outcomes: string[] = [];
  function findList(name: string | null) {
    const matches = name === null ? [] : board.filter(column => normalized(column.name) === normalized(name));
    if (matches.length !== 1) throw new Error(matches.length
      ? `More than one list is named "${name}". Rename a list to make the target clear. No changes were made.`
      : `List "${name ?? ""}" was not found. Specify an existing list. No changes were made.`);
    return matches[0];
  }
  for (const operation of plan.operations) {
    if (["create-list", "rename-list", "delete-list"].includes(operation.type)) {
      if (operation.card !== null || operation.sourceList !== null || operation.details !== null ||
        (operation.type === "create-list" && operation.list !== null) ||
        (operation.type === "delete-list" && operation.title !== null)) throw new Error("The assistant returned an invalid list action. No changes were made.");
      if (operation.type !== "delete-list" && !operation.title?.trim()) throw new Error("Lists need a nonblank name. No changes were made.");
      if (operation.type === "create-list") {
        actions.push({ type: "create-list", listId: crypto.randomUUID(), name: operation.title!.trim() });
        outcomes.push(`Created list "${operation.title!.trim()}".`);
      } else {
        const column = findList(operation.list);
        if (operation.type === "rename-list") {
          actions.push({ type: "rename", columnId: column.id, name: operation.title!.trim() });
          outcomes.push(`Renamed list "${column.name}" to "${operation.title!.trim()}".`);
        } else {
          actions.push({ type: "delete-list", columnId: column.id });
          outcomes.push(`Deleted list "${column.name}" and its cards.`);
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
      outcomes.push(`Created "${operation.title.trim()}" in ${column.name}.`);
      continue;
    }
    const source = operation.sourceList === null ? board : [findList(operation.sourceList)];
    const matches = source.flatMap(column => column.cards.filter(card =>
      operation.card !== null && normalized(card.title) === normalized(operation.card)));
    if (matches.length !== 1) throw new Error(matches.length
      ? `More than one card is named "${operation.card}". Specify its list; if both are in the same list, give them distinct titles. No changes were made.`
      : `Card "${operation.card ?? ""}" was not found. Use its full title and list. No changes were made.`);
    const card = matches[0];
    if (operation.type === "move") {
      const column = findList(operation.list);
      actions.push({ type: "move", cardId: card.id, columnId: column.id });
      outcomes.push(`Moved "${card.title}" to ${column.name}.`);
    } else {
      if (operation.title === null && operation.details === null) throw new Error("Specify a title or details to edit. No changes were made.");
      if (operation.title !== null && !operation.title.trim()) throw new Error("Card titles cannot be blank. No changes were made.");
      actions.push({ type: "edit", cardId: card.id, title: operation.title ?? undefined, details: operation.details ?? undefined });
      outcomes.push(`Updated "${operation.title?.trim() ?? card.title}".`);
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
