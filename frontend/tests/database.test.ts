import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { openDatabase } from "../app/server/db/connection";
import { boardRepository } from "../app/server/db/repository";
import { initialBoard } from "../app/board-state";

let folder: string;
let db: Database.Database;
beforeEach(() => { folder = mkdtempSync(join(tmpdir(), "kanban-db-")); db = openDatabase(join(folder, "board.sqlite"), true); });
afterEach(() => { if (db.open) db.close(); rmSync(folder, { recursive: true, force: true }); });

describe("SQLite persistence", () => {
  it("persists list deletion and contiguous positions, including an empty board without reseeding", () => {
    const repo = boardRepository(db);
    const saved = repo.mutate(0, [{ type: "delete-list", columnId: "ideas" }, { type: "delete-list", columnId: "review" }]);
    expect(saved.columns).toEqual([initialBoard[1], initialBoard[2], initialBoard[4]]);
    expect(db.prepare("SELECT position FROM columns ORDER BY position").all()).toEqual([{ position: 0 }, { position: 1 }, { position: 2 }]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM cards").get()).toEqual({ count: 7 });
    repo.mutate(1, saved.columns.map(column => ({ type: "delete-list", columnId: column.id })));
    db.close(); db = openDatabase(join(folder, "board.sqlite"), true);
    expect(boardRepository(db).read()).toEqual({ revision: 2, columns: [] });
    expect(boardRepository(db).mutate(2, [{ type: "create-list", listId: "fresh", name: "Fresh", color: "#6fd6a8" }]).columns).toEqual([{ id: "fresh", name: "Fresh", color: "#6fd6a8", cards: [] }]);
  });
  it("can move a card out before deleting its old list in the same batch", () => {
    const saved = boardRepository(db).mutate(0, [{ type: "move", cardId: "c1", columnId: "planned" }, { type: "delete-list", columnId: "ideas" }]);
    expect(saved.columns[0].cards.at(-1)).toEqual(initialBoard[0].cards[0]);
    expect(saved.columns).toHaveLength(4);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });
  it("rolls back card removal when list deletion fails", () => {
    db.exec("CREATE TRIGGER fail_delete BEFORE DELETE ON columns BEGIN SELECT RAISE(ABORT, 'test delete failure'); END;");
    expect(() => boardRepository(db).mutate(0, [{ type: "delete-list", columnId: "ideas" }])).toThrow("test delete failure");
    expect(boardRepository(db).read()).toEqual({ columns: initialBoard, revision: 0 });
  });
  it("keeps new lists, order, names and cards after reopening without reseeding", () => {
    const saved = boardRepository(db).mutate(0, [
      { type: "create-list", listId: "sixth", name: "  Released  ", color: "#6fd6a8" },
      { type: "create-list", listId: "seventh", name: "Empty", color: "#ecad0a" },
      { type: "rename", columnId: "sixth", name: "Shipped" },
      { type: "move", cardId: "c1", columnId: "sixth" },
      { type: "add", columnId: "sixth", card: { id: "new", title: "New", details: "Context" } },
      { type: "move-list", columnId: "done", index: 0 },
    ]);
    db.close(); db = openDatabase(join(folder, "board.sqlite"), true);
    expect(boardRepository(db).read()).toEqual(saved);
    expect(saved.columns.map(column => column.id)).toEqual(["done", "ideas", "planned", "progress", "review", "sixth", "seventh"]);
    expect(saved.columns.slice(5)).toEqual([
      { id: "sixth", name: "Shipped", color: "#6fd6a8", cards: [initialBoard[0].cards[0], { id: "new", title: "New", details: "Context" }] },
      { id: "seventh", name: "Empty", color: "#ecad0a", cards: [] },
    ]);
  });
  it("rejects duplicate list IDs and invalid later actions without partial list creation", () => {
    const repo = boardRepository(db);
    for (const later of [
      { type: "create-list", listId: "new", name: "Duplicate", color: "#6fd6a8" },
      { type: "move", cardId: "missing", columnId: "new" },
    ]) expect(() => repo.mutate(0, [{ type: "create-list", listId: "new", name: "New", color: "#6fd6a8" }, later])).toThrow();
    expect(repo.read()).toEqual({ columns: initialBoard, revision: 0 });
  });
  it("rolls back list insertion if a later SQL write fails", () => {
    db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON cards BEGIN SELECT RAISE(ABORT, 'test storage failure'); END;");
    expect(() => boardRepository(db).mutate(0, [
      { type: "create-list", listId: "new", name: "New", color: "#6fd6a8" },
      { type: "move", cardId: "c1", columnId: "new" },
    ])).toThrow("test storage failure");
    expect(boardRepository(db).read()).toEqual({ columns: initialBoard, revision: 0 });
  });
  it("initializes once with foreign keys, WAL, full sync, schema version, and dummy data", () => {
    expect(boardRepository(db).read()).toEqual({ columns: initialBoard, revision: 0 });
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("synchronous", { simple: true })).toBe(2);
    expect(db.pragma("user_version", { simple: true })).toBe(4);
    expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
  });
  it("upgrades a saved board to support optional priorities without changing its revision or cards", () => {
    const existing = boardRepository(db).mutate(0, [{ type: "edit", cardId: "c1", title: "Existing card" }]);
    db.exec("ALTER TABLE cards DROP COLUMN priority; ALTER TABLE columns DROP COLUMN color; PRAGMA user_version = 1;");
    db.close(); db = openDatabase(join(folder, "board.sqlite"), true);
    const repo = boardRepository(db);
    expect(repo.read()).toEqual(existing);
    const priority = { type: "set-priority", cardId: "c1", priority: "medium" };
    const saved = repo.mutate(existing.revision, [priority]);
    expect(saved.columns[0].cards[0]).toEqual({ ...existing.columns[0].cards[0], priority: "medium" });
    expect(repo.mutate(saved.revision, [priority])).toEqual(saved);
    const cleared = repo.mutate(saved.revision, [{ type: "set-priority", cardId: "c1", priority: null }]);
    expect(cleared.columns[0].cards[0]).toEqual(existing.columns[0].cards[0]);
    expect(db.prepare("SELECT priority FROM cards WHERE id = 'c1'").get()).toEqual({ priority: null });
    expect(repo.mutate(cleared.revision, [{ type: "set-priority", cardId: "c1", priority: null }])).toEqual(cleared);
    expect(() => db.prepare("UPDATE cards SET priority = 'other' WHERE id = 'c1'").run()).toThrow("CHECK");
  });
  it("maps retired priorities to the four levels and bumps the revision only when a card changed (issue #44)", () => {
    const reopenAtVersion2 = (priorities: Record<string, string>) => {
      db.exec("DROP TABLE cards; CREATE TABLE cards (id TEXT PRIMARY KEY NOT NULL, column_id TEXT NOT NULL REFERENCES columns(id), title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL, priority TEXT CHECK (priority IN ('low', 'normal', 'medium', 'high', 'urgent', 'critical'))); ALTER TABLE columns DROP COLUMN color; PRAGMA user_version = 2;");
      const insert = db.prepare("INSERT INTO cards (id, column_id, title, details, position, priority) VALUES (?, 'ideas', ?, '', ?, ?)");
      Object.entries(priorities).forEach(([id, priority], position) => insert.run(id, id, position, priority));
      db.close(); db = openDatabase(join(folder, "board.sqlite"), true);
      return boardRepository(db).read();
    };
    const unchanged = reopenAtVersion2({ a: "low", b: "high" });
    expect(unchanged.revision).toBe(0);
    expect(unchanged.columns[0].cards.map(card => card.priority)).toEqual(["low", "high"]);
    const migrated = reopenAtVersion2({ a: "low", b: "normal", c: "medium", d: "high", e: "urgent", f: "critical", g: null as unknown as string });
    expect(migrated.revision).toBe(1);
    expect(migrated.columns[0].cards.map(card => card.priority)).toEqual(["low", "medium", "medium", "high", "urgent", "urgent", undefined]);
    expect(() => db.prepare("UPDATE cards SET priority = 'critical' WHERE id = 'a'").run()).toThrow("CHECK");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'cards' AND sql IS NOT NULL").all()).toEqual([{ name: "cards_column_position" }]);
  });
  it("gives existing lists the color their position showed, without changing the revision (issue #51)", () => {
    const repo = boardRepository(db);
    const before = repo.mutate(0, [
      { type: "create-list", listId: "sixth", name: "Sixth", color: "#6fd6a8" },
      { type: "delete-list", columnId: "planned" },
    ]);
    db.exec("ALTER TABLE columns DROP COLUMN color; PRAGMA user_version = 3;");
    db.close(); db = openDatabase(join(folder, "board.sqlite"), true);
    const migrated = boardRepository(db).read();
    expect(migrated.revision).toBe(before.revision);
    expect(migrated.columns.map(column => [column.id, column.color])).toEqual([
      ["ideas", "#b0b9c8"], ["progress", "#79bdf0"], ["review", "#8f98f6"], ["done", "#c08cf0"], ["sixth", "#5ccfe6"],
    ]);
    expect(() => db.prepare("UPDATE columns SET color = 'red' WHERE id = 'ideas'").run()).toThrow("CHECK");
  });
  it("persists rename, creation, edits, ordering, cross-column insertion, and deletion on reopen", () => {
    const repo = boardRepository(db);
    const result = repo.mutate(0, [
      { type: "rename", columnId: "ideas", name: "  Backlog  " },
      { type: "add", columnId: "ideas", card: { id: "new", title: " New card ", details: " Context " } },
      { type: "edit", cardId: "new", title: "Ready", details: "" },
      { type: "move", cardId: "c3", columnId: "ideas", index: 0 },
      { type: "move", cardId: "new", columnId: "planned", index: 1 },
      { type: "delete", cardId: "c2" },
    ]);
    db.close(); db = openDatabase(join(folder, "board.sqlite"), true);
    expect(boardRepository(db).read()).toEqual(result);
    expect(result.revision).toBe(1);
    expect(result.columns[0].name).toBe("Backlog");
    expect(result.columns[0].cards.map(card => card.id)).toEqual(["c3", "c1"]);
    expect(result.columns[1].cards[1]).toEqual({ id: "new", title: "Ready", details: "" });
    expect(db.prepare("SELECT position FROM cards WHERE column_id = 'ideas' ORDER BY position").all()).toEqual([{ position: 0 }, { position: 1 }]);
  });
  it("does not reseed a deliberately empty board", () => {
    const repo = boardRepository(db);
    repo.mutate(0, initialBoard.flatMap(column => column.cards.map(card => ({ type: "delete", cardId: card.id }))));
    db.close(); db = openDatabase(join(folder, "board.sqlite"), true);
    expect(boardRepository(db).read().columns.flatMap(column => column.cards)).toHaveLength(0);
  });
  it("detects competing revisions across independent database connections", () => {
    const second = openDatabase(join(folder, "board.sqlite"));
    try {
      const revision = boardRepository(second).read().revision;
      boardRepository(db).mutate(revision, [{ type: "delete", cardId: "c1" }]);
      expect(() => boardRepository(second).mutate(revision, [{ type: "delete", cardId: "c2" }])).toThrow("another tab");
      expect(boardRepository(second).read().columns[0].cards.map(card => card.id)).toEqual(["c2", "c3"]);
    } finally { second.close(); }
  });
  it("rolls back a whole SQL batch if a later write fails", () => {
    db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON cards BEGIN SELECT RAISE(ABORT, 'test storage failure'); END;");
    expect(() => boardRepository(db).mutate(0, [{ type: "rename", columnId: "ideas", name: "Changed" }, { type: "edit", cardId: "c1", details: "Changed" }])).toThrow("test storage failure");
    expect(boardRepository(db).read()).toEqual({ columns: initialBoard, revision: 0 });
  });
  it("invalid later targets leave earlier valid actions unchanged", () => {
    expect(() => boardRepository(db).mutate(0, [{ type: "delete", cardId: "c1" }, { type: "edit", cardId: "c1", title: "Gone" }])).toThrow("no longer exists");
    expect(boardRepository(db).read()).toEqual({ columns: initialBoard, revision: 0 });
  });
  it("does not increment revision on empty or unchanged operations", () => {
    const repo = boardRepository(db);
    expect(repo.mutate(0, []).revision).toBe(0);
    expect(repo.mutate(0, [{ type: "move", cardId: "c1", columnId: "ideas", index: 0 }]).revision).toBe(0);
  });
  it("enforces relational and nonblank constraints directly in SQLite", () => {
    expect(() => db.prepare("INSERT INTO cards (id, column_id, title, details, position) VALUES ('bad', 'missing', 'Title', '', 0)").run()).toThrow("FOREIGN KEY");
    expect(() => db.prepare("UPDATE cards SET title = ' ' WHERE id = 'c1'").run()).toThrow("CHECK");
    expect(() => db.prepare("UPDATE columns SET position = -1 WHERE id = 'ideas'").run()).toThrow("CHECK");
  });
  it("backs up a live WAL database and restores its exact content", async () => {
    const repo = boardRepository(db);
    const saved = repo.mutate(0, [{ type: "edit", cardId: "c1", details: "Backed up" }]);
    const destination = join(folder, "backup.sqlite");
    await db.backup(destination);
    const restored = openDatabase(destination);
    try { expect(boardRepository(restored).read()).toEqual(saved); expect(restored.pragma("integrity_check", { simple: true })).toBe("ok"); }
    finally { restored.close(); }
  });
  it("refuses unmigrated and future schemas without damaging data", () => {
    expect(() => openDatabase(join(folder, "fresh.sqlite"))).toThrow("not initialized");
    db.pragma("user_version = 5");
    expect(() => openDatabase(join(folder, "board.sqlite"), true)).toThrow("newer");
    expect(db.prepare("SELECT count(*) AS count FROM cards").get()).toEqual({ count: 12 });
  });
});
