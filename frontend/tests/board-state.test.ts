import { describe, expect, it } from "vitest";
import { boardReducer, initialBoard } from "../app/board-state";

describe("board state", () => {
  it("deletes only the selected list and its cards, including the final list", () => {
    const result = boardReducer(initialBoard, { type: "delete-list", columnId: "ideas" });
    expect(result).toEqual(initialBoard.slice(1));
    expect(result.flatMap(column => column.cards)).toHaveLength(9);
    expect(boardReducer([initialBoard[0]], { type: "delete-list", columnId: "ideas" })).toEqual([]);
    expect(initialBoard).toHaveLength(5);
  });
  it("creates empty trimmed lists and supports renaming, adding and moving cards through them", () => {
    let board = boardReducer(initialBoard, { type: "create-list", listId: "new-list", name: "  Released  " });
    expect(board).toHaveLength(6);
    expect(board[5]).toEqual({ id: "new-list", name: "Released", cards: [] });
    expect(board.slice(0, 5)).toEqual(initialBoard);
    expect(boardReducer(board, { type: "create-list", listId: "blank", name: " \t " })).toBe(board);
    board = boardReducer(board, { type: "rename", columnId: "new-list", name: "Shipped" });
    board = boardReducer(board, { type: "add", columnId: "new-list", card: { id: "new-card", title: "New task", details: "Context" } });
    board = boardReducer(board, { type: "move", cardId: "c1", columnId: "new-list", index: 0 });
    expect(board[5].cards).toEqual([initialBoard[0].cards[0], { id: "new-card", title: "New task", details: "Context" }]);
    board = boardReducer(board, { type: "move", cardId: "c1", columnId: "ideas", index: 0 });
    expect(board[0]).toEqual(initialBoard[0]);
    expect(initialBoard).toHaveLength(5);
  });
  it.each([
    [0, ["c1", "c4", "c5"]],
    [1, ["c4", "c1", "c5"]],
    [2, ["c4", "c5", "c1"]],
  ])("inserts into another column at index %i with card identities and content intact", (index, expected) => {
    const result = boardReducer(initialBoard, { type: "move", cardId: "c1", columnId: "planned", index });
    expect(result[1].cards.map(card => card.id)).toEqual(expected);
    expect(result[1].cards[index]).toBe(initialBoard[0].cards[0]);
    expect(result[0].cards.map(card => card.id)).toEqual(["c2", "c3"]);
    expect(result.flatMap(column => column.cards)).toHaveLength(12);
    expect(initialBoard[1].cards.map(card => card.id)).toEqual(["c4", "c5"]);
  });
  it("starts with five columns and unique cards", () => {
    expect(initialBoard).toHaveLength(5);
    const ids = initialBoard.flatMap(column => column.cards.map(card => card.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("adds a trimmed card to only its selected column without mutating the seed", () => {
    const result = boardReducer(initialBoard, { type: "add", columnId: "planned", card: { id: "new", title: "  Ship it  ", details: "  Context  " } });
    expect(result[1].cards.at(-1)).toEqual({ id: "new", title: "Ship it", details: "Context" });
    expect(initialBoard[1].cards).toHaveLength(2);
    expect(result[0]).toBe(initialBoard[0]);
  });
  it("sets and clears a card priority without changing its content", () => {
    const prioritized = boardReducer(initialBoard, { type: "set-priority", cardId: "c1", priority: "medium" });
    expect(prioritized[0].cards[0]).toEqual({ ...initialBoard[0].cards[0], priority: "medium" });
    const cleared = boardReducer(prioritized, { type: "set-priority", cardId: "c1", priority: null });
    expect(cleared[0].cards[0]).toEqual(initialBoard[0].cards[0]);
    expect(cleared[0].cards[0]).not.toHaveProperty("priority");
  });
  it("allows empty details and rejects whitespace titles", () => {
    const result = boardReducer(initialBoard, { type: "add", columnId: "ideas", card: { id: "new", title: "Task", details: "" } });
    expect(result[0].cards.at(-1)?.details).toBe("");
    expect(boardReducer(initialBoard, { type: "add", columnId: "ideas", card: { id: "new", title: "  ", details: "x" } })).toBe(initialBoard);
  });
  it("renames only the selected column, trims names, and rejects blank names", () => {
    const result = boardReducer(initialBoard, { type: "rename", columnId: "ideas", name: "  Backlog  " });
    expect(result[0].name).toBe("Backlog");
    expect(result[0].cards).toBe(initialBoard[0].cards);
    expect(result[1]).toBe(initialBoard[1]);
    expect(result).toHaveLength(5);
    expect(boardReducer(initialBoard, { type: "rename", columnId: "ideas", name: " " })).toBe(initialBoard);
  });
  it("deletes just the intended card and supports an empty column", () => {
    const once = boardReducer(initialBoard, { type: "delete", cardId: "c11" });
    const result = boardReducer(once, { type: "delete", cardId: "c12" });
    expect(result[4].cards).toEqual([]);
    expect(result[0].cards).toEqual(initialBoard[0].cards);
    expect(initialBoard[4].cards).toHaveLength(2);
  });
  it("moves cards to empty and populated columns repeatedly without loss or duplication", () => {
    let result = boardReducer(initialBoard, { type: "delete", cardId: "c11" });
    result = boardReducer(result, { type: "delete", cardId: "c12" });
    for (const columnId of ["done", "planned", "progress", "review", "ideas"]) {
      result = boardReducer(result, { type: "move", cardId: "c1", columnId });
      expect(result.find(column => column.id === columnId)?.cards.at(-1)).toBe(initialBoard[0].cards[0]);
      expect(result.flatMap(column => column.cards)).toHaveLength(10);
      expect(result.flatMap(column => column.cards).filter(card => card.id === "c1")).toHaveLength(1);
    }
    expect(initialBoard[0].cards).toHaveLength(3);
  });
  it.each([
    { cardId: "c1", index: 2, expectedIds: ["c2", "c3", "c1"] },
    { cardId: "c3", index: 0, expectedIds: ["c3", "c1", "c2"] },
    { cardId: "c1", index: 1, expectedIds: ["c2", "c1", "c3"] },
  ])("moves $cardId to final index $index within its column", ({ cardId, index, expectedIds }) => {
    const originalCards = initialBoard[0].cards;
    const originalContents = structuredClone(originalCards);

    const result = boardReducer(initialBoard, { type: "move", cardId, columnId: "ideas", index });

    expect(result[0].cards.map(card => card.id)).toEqual(expectedIds);
    for (const card of result[0].cards) {
      expect(card).toBe(originalCards.find(original => original.id === card.id));
      expect(card).toEqual(originalContents.find(original => original.id === card.id));
    }
    expect(result.flatMap(column => column.cards)).toHaveLength(12);
    expect(initialBoard[0].cards).toEqual(originalContents);
    expect(result.slice(1)).toHaveLength(4);
    for (const [index, column] of result.entries()) {
      if (index > 0) expect(column).toBe(initialBoard[index]);
    }
  });
  it.each([
    { cardId: "c1", index: 0 },
    { cardId: "c2", index: 1 },
    { cardId: "c3", index: 2 },
  ])("keeps the board unchanged when $cardId is dropped at its current index $index", ({ cardId, index }) => {
    expect(boardReducer(initialBoard, { type: "move", cardId, columnId: "ideas", index })).toBe(initialBoard);
  });
  it("keeps a single-card column unchanged when its card is dropped at index zero", () => {
    const board = boardReducer(initialBoard, { type: "delete", cardId: "c12" });

    expect(boardReducer(board, { type: "move", cardId: "c11", columnId: "done", index: 0 })).toBe(board);
  });

  it("leaves state unchanged when a card is dropped in its current column", () => {
    expect(boardReducer(initialBoard, { type: "move", cardId: "c1", columnId: "ideas" })).toBe(initialBoard);
  });
});
