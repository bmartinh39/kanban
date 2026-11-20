import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { join } from "node:path";
import { initialBoard } from "../app/board-state";

// Use real requests here: ordinary UI tests intentionally intercept these APIs.
test("test server starts with its temporary database and cannot call live AI", async ({ request }) => {
  const response = await request.get("/api/board");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ columns: initialBoard, revision: 0 });
  const database = new Database(join(process.env.KANBAN_UI_DATABASE_DIRECTORY!, "board.sqlite"), { readonly: true });
  try {
    expect(database.prepare("SELECT revision FROM board_state").get()).toEqual({ revision: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM columns").get()).toEqual({ count: initialBoard.length });
  } finally { database.close(); }
  const assistant = await request.post("/api/assistant", {
    data: { revision: 0, messages: [{ role: "user", content: "Create a test card." }] },
  });
  expect(assistant.status()).toBe(503);
  expect((await assistant.json()).error).toMatch(/key|configured/i);
});
