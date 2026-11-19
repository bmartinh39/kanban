import { describe, expect, it } from "vitest";
import { parsePlan, prepareActions, type AssistantOperation } from "../app/assistant-commands";
import { boardReducer, initialBoard } from "../app/board-state";

const operation = (fields: Partial<AssistantOperation>): AssistantOperation => ({
  type: "create", list: null, sourceList: null, card: null, title: null, details: null, ...fields,
});

describe("assistant commands", () => {
  it("creates and renames lists while preserving existing IDs and cards", () => {
    const { actions, deletedLists } = prepareActions(initialBoard, parsePlan({ message: "Done", operations: [
      operation({ type: "create-list", title: "  Review  " }),
      operation({ type: "rename-list", list: " ideas ", title: "  Backlog  " }),
    ] }));
    const result = actions.reduce(boardReducer, initialBoard);
    expect(result[0]).toEqual({ ...initialBoard[0], name: "Backlog" });
    expect(result.at(-1)).toEqual({ id: expect.any(String), name: "Review", cards: [] });
    expect(deletedLists).toEqual([]);
  });
  it("reports the actual deleted lists and card counts after earlier moves in a mixed batch", () => {
    const { actions, deletedLists } = prepareActions(initialBoard, { message: "Done", operations: [
      operation({ type: "move", card: initialBoard[0].cards[0].title, list: "Done" }),
      operation({ type: "delete-list", list: "Done" }),
      operation({ type: "delete-list", list: "Planned" }),
    ] });
    expect(deletedLists.map(column => [column.name, column.cards.length])).toEqual([["Done", 3], ["Planned", 2]]);
    const result = actions.reduce(boardReducer, initialBoard);
    expect(result).toHaveLength(3);
    expect(result.flatMap(column => column.cards)).toHaveLength(7);
    expect(initialBoard).toHaveLength(5);
  });
  it("can create on an empty board and propose deleting the final empty list", () => {
    const created = prepareActions([], { message: "Done", operations: [operation({ type: "create-list", title: "First" })] });
    const board = created.actions.reduce(boardReducer, []);
    const deletion = prepareActions(board, { message: "Done", operations: [operation({ type: "delete-list", list: "First" })] });
    expect(deletion.deletedLists).toEqual(board);
    expect(deletion.actions.reduce(boardReducer, board)).toEqual([]);
  });
  it.each([
    [operation({ type: "create-list", title: " " })],
    [operation({ type: "create-list", title: "x".repeat(20001) })],
    [operation({ type: "rename-list", list: "Ideas", title: " " })],
    [operation({ type: "delete-list", list: "Missing" })],
    [operation({ type: "delete-list", list: "Ideas", card: "Anything" })],
    [operation({ type: "delete-list", list: "Ideas", title: "Anything" })],
    [operation({ type: "create-list", list: "Ideas", title: "New" })],
    [operation({ type: "rename-list", list: "Ideas", title: "New", details: "Unsupported" })],
    [operation({ type: "delete-list", list: "Ideas" }), operation({ type: "delete-list", list: "Ideas" })],
    [operation({ type: "delete-list", list: "Ideas" }), operation({ list: "Ideas", title: "Too late" })],
  ].map(operations => ({ operations })))("rejects invalid/conflicting list batches without changing the board: %j", ({ operations }) => {
    const before = structuredClone(initialBoard);
    expect(() => prepareActions(initialBoard, { message: "Done", operations })).toThrow("No changes were made.");
    expect(initialBoard).toEqual(before);
  });
  it("rejects ambiguous list deletion", () => {
    const board = structuredClone(initialBoard);
    board[1].name = "Ideas";
    expect(() => prepareActions(board, { message: "Done", operations: [operation({ type: "delete-list", list: "Ideas" })] })).toThrow("More than one list");
  });
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
    expect(prepareActions(initialBoard, { message: "Which card?", operations: [] })).toEqual({ actions: [], message: "Which card?", deletedLists: [] });
  });
  it.each([null, {}, { message: "", operations: [] }, { message: "x", operations: [{}] },
    { message: "x", operations: [operation({ type: "delete" as "edit" })] },
    { message: "x", operations: [{ ...operation({}), type: ["create-list"] }] },
    { message: "x", operations: [{ ...operation({}), title: 42 }] },
    { message: "x", operations: Array(21).fill(operation({})) },
  ])("rejects malformed or unsupported plans: %j", value => {
    expect(() => parsePlan(value)).toThrow("invalid");
  });
});
