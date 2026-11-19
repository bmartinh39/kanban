import { test as base, expect } from "@playwright/test";
import { initialBoard } from "../app/board-state";
import { applyCommands, type BoardSnapshot } from "../app/board-commands";

export const test = base.extend<{ boardState: BoardSnapshot }>({
  boardState: async ({}, provide) => { await provide({ columns: structuredClone(initialBoard), revision: 0 }); },
  page: async ({ page, boardState }, provide) => {
    await page.route("**/api/board", route => route.fulfill({ json: boardState }));
    await page.route("**/api/board/actions", async route => {
      const body = route.request().postDataJSON();
      if (body.revision !== boardState.revision) return route.fulfill({ status: 409, json: { error: "The board changed. Reload and retry." } });
      boardState.columns = applyCommands(boardState.columns, body.actions);
      boardState.revision++;
      await route.fulfill({ json: boardState });
    });
    await provide(page);
  },
});
export { expect };
