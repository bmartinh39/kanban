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
  it("initializes once with foreign keys, WAL, full sync, schema version, and dummy data", () => {
    expect(boardRepository(db).read()).toEqual({ columns: initialBoard, revision: 0 });
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("synchronous", { simple: true })).toBe(2);
    expect(db.pragma("user_version", { simple: true })).toBe(1);
    expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
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
    expect(() => db.prepare("INSERT INTO cards VALUES ('bad', 'missing', 'Title', '', 0)").run()).toThrow("FOREIGN KEY");
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
    db.pragma("user_version = 2");
    expect(() => openDatabase(join(folder, "board.sqlite"), true)).toThrow("newer");
    expect(db.prepare("SELECT count(*) AS count FROM cards").get()).toEqual({ count: 12 });
  });
});
