import { describe, expect, it } from "vitest";
import { parsePlan, prepareActions, type AssistantOperation } from "../app/assistant-commands";
import { boardReducer, initialBoard } from "../app/board-state";

const operation = (fields: Partial<AssistantOperation>): AssistantOperation => ({
  type: "create", list: null, sourceList: null, card: null, title: null, details: null, ...fields,
});

describe("assistant commands", () => {
  it("applies a batch only to the exact snapshot it was planned against", () => {
    const actions = prepareActions(initialBoard, { message: "", operations: [operation({ list: "Ideas", title: "Task" })] }).actions;
    const action = { type: "assistant" as const, snapshot: initialBoard, actions };
    expect(boardReducer(initialBoard, action)[0].cards).toHaveLength(4);
    const changed = boardReducer(initialBoard, { type: "rename", columnId: "ideas", name: "Backlog" });
    expect(boardReducer(changed, action)).toBe(changed);
  });
  it("creates trimmed cards and edits/moves an existing ID without changing other content", () => {
    const plan = { message: "Done", operations: [
      operation({ list: " planned ", title: "  Launch  ", details: "  Context  " }),
      operation({ type: "edit", card: initialBoard[0].cards[0].title, title: "  New homepage  " }),
      operation({ type: "move", card: initialBoard[0].cards[0].title, list: "Done" }),
    ] };
    const { actions, message } = prepareActions(initialBoard, parsePlan(plan));
    const result = actions.reduce(boardReducer, initialBoard);
    expect(result[1].cards.at(-1)).toMatchObject({ title: "Launch", details: "Context" });
    expect(result[4].cards.at(-1)).toEqual({ ...initialBoard[0].cards[0], title: "New homepage" });
    expect(result.flatMap(column => column.cards)).toHaveLength(13);
    expect(result.flatMap(column => column.cards).filter(card => card.id === "c1")).toHaveLength(1);
    expect(initialBoard[0].cards[0].title).toBe("Give the homepage a fresh start");
    expect(message).toContain('Created "Launch" in Planned.');
    expect(message).not.toBe("Done");
  });
  it("clears details while preserving ID/title, accepts title-only creation", () => {
    const { actions } = prepareActions(initialBoard, { message: "", operations: [
      operation({ type: "edit", card: initialBoard[0].cards[0].title, details: "" }),
      operation({ list: "Ideas", title: "Just a title" }),
    ] });
    const result = actions.reduce(boardReducer, initialBoard);
    expect(result[0].cards[0]).toEqual({ ...initialBoard[0].cards[0], details: "" });
    expect(result[0].cards.at(-1)?.details).toBe("");
  });
  it.each([
    operation({ list: "Missing", title: "Task" }),
    operation({ list: "Ideas", title: "  " }),
    operation({ type: "move", card: "Missing", list: "Done" }),
    operation({ type: "move", card: initialBoard[0].cards[0].title, list: "Missing" }),
    operation({ type: "edit", card: initialBoard[0].cards[0].title }),
    operation({ type: "edit", card: initialBoard[0].cards[0].title, title: " " }),
    operation({ type: "edit", card: initialBoard[0].cards[0].title, sourceList: "Missing", details: "x" }),
  ])("rejects invalid targets or values atomically: %j", invalid => {
    const snapshot = structuredClone(initialBoard);
    expect(() => prepareActions(initialBoard, { message: "", operations: [operation({ list: "Ideas", title: "Valid first" }), invalid] })).toThrow("No changes were made.");
    expect(initialBoard).toEqual(snapshot);
  });
  it("rejects ambiguous cards and resolves a specified source list", () => {
    const board = structuredClone(initialBoard);
    board[1].cards.push({ ...board[0].cards[0], id: "duplicate" });
    const move = operation({ type: "move", card: board[0].cards[0].title, list: "Done" });
    expect(() => prepareActions(board, { message: "", operations: [move] })).toThrow("More than one card");
    expect(prepareActions(board, { message: "", operations: [{ ...move, sourceList: "Ideas" }] }).actions[0]).toMatchObject({ cardId: "c1" });
    board[1].name = "Ideas";
    expect(() => prepareActions(board, { message: "", operations: [operation({ list: "Ideas", title: "Task" })] })).toThrow("More than one list");
  });
  it("returns clarification without changes", () => {
    expect(prepareActions(initialBoard, { message: "Which card?", operations: [] })).toEqual({ actions: [], message: "Which card?" });
  });
  it.each([null, {}, { message: "", operations: [] }, { message: "x", operations: [{}] },
    { message: "x", operations: [operation({ type: "delete" as "edit" })] },
    { message: "x", operations: [{ ...operation({}), title: 42 }] },
    { message: "x", operations: Array(21).fill(operation({})) },
  ])("rejects malformed or unsupported plans: %j", value => {
    expect(() => parsePlan(value)).toThrow("invalid");
  });
});
