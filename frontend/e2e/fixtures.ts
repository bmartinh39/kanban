import { test as base, expect, type Locator, type Page } from "@playwright/test";
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

// Arrow keys are ignored until the keyboard sensor has an active drop target. The sensor also attaches its
// keydown listener in a timer, which Chrome can run after queued input; one timer round trip runs after it.
export async function expectKeyboardDropTarget(page: Page) {
  await expect(page.locator(".column.is-over")).toHaveCount(1);
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve)));
}

// Cards drag from the free space around their text (issue #50); the left padding is clear of text and controls.
export async function grabPoint(card: Locator) {
  const { x, y, height } = (await card.boundingBox())!;
  return { x: x + 6, y: y + height / 2 };
}
