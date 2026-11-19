import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initialBoard } from "../../board-state.ts";

// Numbered SQL migrations are kept together with the connection for startup and backups.
const migrations = [
  `CREATE TABLE board_state (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL CHECK (revision >= 0));
   CREATE TABLE columns (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK (length(trim(name)) > 0), position INTEGER NOT NULL CHECK (position >= 0));
   CREATE TABLE cards (id TEXT PRIMARY KEY NOT NULL, column_id TEXT NOT NULL REFERENCES columns(id), title TEXT NOT NULL CHECK (length(trim(title)) > 0), details TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL CHECK (position >= 0));
   CREATE INDEX columns_position ON columns(position);
   CREATE INDEX cards_column_position ON cards(column_id, position);`,
];

export function openDatabase(path = process.env.DATABASE_PATH || "./data/kanban.sqlite", migrate = false) {
  if (path !== ":memory:") mkdirSync(dirname(resolve(/* turbopackIgnore: true */ path)), { recursive: true });
  const db = new Database(path);
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = FULL");
    db.pragma("busy_timeout = 5000");
    if (migrate) {
      db.transaction(() => {
        const version = db.pragma("user_version", { simple: true }) as number;
        if (version > migrations.length) throw new Error("Database schema is newer than this application.");
        for (let index = version; index < migrations.length; index++) {
          db.exec(migrations[index]);
          db.pragma(`user_version = ${index + 1}`);
        }
        if (!db.prepare("SELECT id FROM board_state WHERE id = 1").get()) {
          const column = db.prepare("INSERT INTO columns (id, name, position) VALUES (?, ?, ?)");
          const card = db.prepare("INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)");
          initialBoard.forEach((item, position) => {
            column.run(item.id, item.name, position);
            item.cards.forEach((entry, order) => card.run(entry.id, item.id, entry.title, entry.details, order));
          });
          db.prepare("INSERT INTO board_state (id, revision) VALUES (1, 0)").run();
        }
      }).immediate();
    }
    if (db.pragma("user_version", { simple: true }) !== migrations.length || !db.prepare("SELECT id FROM board_state WHERE id = 1").get()) {
      throw new Error("Database is not initialized. Run npm run db:migrate before starting the server.");
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
