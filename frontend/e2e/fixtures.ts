import { test as base, expect, type Page } from "@playwright/test";
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

export async function visibleBoardFrame(page: Page) {
  return page.getByLabel("Project board columns").evaluate(element => {
    const board = element.getBoundingClientRect();
    const x = Math.max(0, board.left);
    const y = Math.max(0, board.top);
    return { x, y, width: Math.min(window.innerWidth, board.right) - x, height: Math.min(window.innerHeight, board.bottom) - y };
  });
}

// Arrow keys are ignored until the keyboard sensor has an active drop target.
export async function expectKeyboardDropTarget(page: Page) {
  await expect(page.locator(".column.is-over")).toHaveCount(1);
}
