import type Database from "better-sqlite3";
import { applyCommands, parseCommands, type BoardSnapshot } from "../../board-commands";
import type { Card, CardPriority, Column } from "../../board-state";

type CardRow = Omit<Card, "priority"> & { column_id: string; priority: CardPriority | null };

export class BoardConflict extends Error {
  constructor() { super("The board changed in another tab. The latest board has been loaded. Review it and try again."); }
}

export function boardRepository(db: Database.Database) {
  function read(): BoardSnapshot {
    const columns = db.prepare("SELECT id, name FROM columns ORDER BY position, id").all() as Omit<Column, "cards">[];
    const cards = db.prepare("SELECT id, column_id, title, details, priority FROM cards ORDER BY position, id").all() as CardRow[];
    const { revision } = db.prepare("SELECT revision FROM board_state WHERE id = 1").get() as { revision: number };
    return { revision, columns: columns.map(column => ({
      ...column,
      cards: cards.filter(card => card.column_id === column.id).map(({ id, title, details, priority }) =>
        priority === null ? { id, title, details } : { id, title, details, priority }),
    })) };
  }
  return {
    read: db.transaction(read),
    mutate(expectedRevision: number, value: unknown): BoardSnapshot {
      const actions = parseCommands(value);
      return db.transaction(() => {
        const before = read();
        if (before.revision !== expectedRevision) throw new BoardConflict();
        const columns = applyCommands(before.columns, actions);
        if (JSON.stringify(columns) === JSON.stringify(before.columns)) return before;

        const previous = new Map(before.columns.flatMap(column => column.cards.map((card, position) => [card.id, { ...card, columnId: column.id, position }] as const)));
        const remaining = new Set(columns.flatMap(column => column.cards.map(card => card.id)));
        const remove = db.prepare("DELETE FROM cards WHERE id = ?");
        for (const id of previous.keys()) if (!remaining.has(id)) remove.run(id);
        const removeColumn = db.prepare("DELETE FROM columns WHERE id = ?");
        // Cards that move out of a deleted list must be written before its removal.
        const rename = db.prepare("UPDATE columns SET name = ?, position = ? WHERE id = ?");
        const insertColumn = db.prepare("INSERT INTO columns (id, name, position) VALUES (?, ?, ?)");
        const upsert = db.prepare(`INSERT INTO cards (id, column_id, title, details, position, priority) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET column_id = excluded.column_id, title = excluded.title,
          details = excluded.details, position = excluded.position, priority = excluded.priority`);
        columns.forEach((column, index) => {
          const oldColumn = before.columns.find(item => item.id === column.id);
          if (!oldColumn) insertColumn.run(column.id, column.name, index);
          else rename.run(column.name, index, column.id);
          column.cards.forEach((card, position) => {
            const old = previous.get(card.id);
            if (!old || old.columnId !== column.id || old.position !== position || old.title !== card.title ||
                old.details !== card.details || old.priority !== card.priority) {
              upsert.run(card.id, column.id, card.title, card.details, position, card.priority ?? null);
            }
          });
        });
        for (const column of before.columns) if (!columns.some(item => item.id === column.id)) removeColumn.run(column.id);
        db.prepare("UPDATE board_state SET revision = revision + 1 WHERE id = 1").run();
        return read();
      }).immediate();
    },
  };
}
