import type { Page } from "@playwright/test";
import { expect, test, visibleBoardFrame, expectKeyboardDropTarget, grabPoint } from "./fixtures";

const orders = [["c1", "c4", "c5"], ["c4", "c1", "c5"], ["c4", "c5", "c1"]];
const column = (page: Page) => page.getByRole("region", { name: "Planned column", exact: true });
const handle = (page: Page) => page.getByTestId("card-c1");

async function pointerStart(page: Page) {
  const source = handle(page);
  await source.evaluate(element => element.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -80));
  const { x, y } = await grabPoint(source);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y);
  await expect(source).toHaveClass(/is-dragging/);
}

async function pointerSlot(page: Page, index: number) {
  const target = column(page).getByRole("article").nth(Math.min(index, 1));
  await target.evaluate(element => element.scrollIntoView({ block: "center", inline: "center" }));
  await target.evaluate((element, index) => {
    // A previous preview can shift the rendered card beyond its actual layout slot.
    const rect = element.getBoundingClientRect();
    const transform = new DOMMatrix(getComputedStyle(element).transform);
    const targetY = rect.y - transform.m42 + (index === 2 ? rect.height + 11 : rect.height / 4);
    window.scrollBy(0, targetY - window.innerHeight / 2);
  }, index);
  const bounds = await target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { x: rect.x - matrix.m41, y: rect.y - matrix.m42, width: rect.width, height: rect.height };
  });
  const frame = await visibleBoardFrame(page);
  const viewport = (await page.getByLabel("Project board columns").boundingBox())!;
  const left = Math.max(bounds.x, viewport.x, frame.x);
  const right = Math.min(bounds.x + bounds.width, viewport.x + viewport.width, frame.x + frame.width);
  const y = index === 2 ? bounds.y + bounds.height + 11 : bounds.y + bounds.height / 4;
  expect(y).toBeGreaterThan(Math.max(frame.y, viewport.y));
  expect(y).toBeLessThan(Math.min(frame.y + frame.height, viewport.y + viewport.height));
  await page.mouse.move((left + right) / 2, y, { steps: 10 });
  await expect(column(page)).toHaveClass(/is-over/);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  await page.keyboard.press("Escape");
});

for (const input of ["pointer", "keyboard"] as const) {
  for (const index of [0, 1, 2]) {
    test(`${input} inserts at destination position ${index + 1} with a matching gap and one save`, async ({ page, boardState }) => {
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      const writes: unknown[] = [];
      await page.route("**/api/board/actions", async route => {
        writes.push(route.request().postDataJSON());
        await pending;
        await route.fallback();
      });
      const content = structuredClone(boardState.columns.flatMap(item => item.cards));
      try {
        if (input === "pointer") {
          await pointerStart(page);
          await pointerSlot(page, index);
        } else {
          await handle(page).press("Space");
          await expect(handle(page)).toHaveClass(/is-dragging/);
          await expectKeyboardDropTarget(page);
          await page.keyboard.press("ArrowRight");
          await expect(column(page)).toHaveClass(/is-over/);
          for (let position = 2; position > index; position--) {
            await page.keyboard.press("ArrowUp");
            await expect(page.getByRole("status")).toContainText(`position ${position} of 3`);
          }
        }
        const gap = column(page).locator(".insertion-preview");
        await expect(gap).toBeVisible();
        expect(boardState.revision).toBe(0);
        expect(writes).toHaveLength(0);
        await expect(column(page).getByRole("article")).toHaveCount(2);
        if (index < 2) {
          const next = page.getByTestId(index === 0 ? "card-c4" : "card-c5");
          await expect.poll(async () => {
            const [space, card] = await Promise.all([gap.boundingBox(), next.boundingBox()]);
            return Math.round(card!.y - space!.y - space!.height);
          }).toBe(11);
          await expect(next).toHaveCSS("transition-property", "transform");
        }
        if (index > 0) {
          const previous = page.getByTestId(index === 1 ? "card-c4" : "card-c5");
          const [card, space] = await Promise.all([previous.boundingBox(), gap.boundingBox()]);
          expect(Math.round(space!.y - card!.y - card!.height)).toBe(11);
        }
        if (input === "pointer") await page.mouse.up();
        else await page.keyboard.press("Space");
        await expect(page.locator(".save-status")).toHaveText("Saving...");
        await expect(column(page).getByRole("article")).toHaveCount(3);
        await expect(gap).toHaveCount(0);
        expect(await column(page).getByRole("article").evaluateAll(cards => cards.map(card => card.getAttribute("data-testid")))).toEqual(orders[index].map(id => `card-${id}`));
        expect(writes).toEqual([{ revision: 0, actions: [{ type: "move", cardId: "c1", columnId: "planned", ...(index < 2 ? { index } : {}) }] }]);
      } finally { release(); }
      await expect(page.locator(".save-status")).toHaveText("Saved");
      await expect(page.locator(".drag-preview")).toHaveCount(0);
      await page.reload();
      await expect(column(page).getByRole("article")).toHaveCount(3);
      expect(await column(page).getByRole("article").evaluateAll(cards => cards.map(card => card.getAttribute("data-testid")))).toEqual(orders[index].map(id => `card-${id}`));
      expect(boardState.columns.flatMap(item => item.cards).sort((a, b) => a.id.localeCompare(b.id))).toEqual(content.sort((a, b) => a.id.localeCompare(b.id)));
      expect(boardState.revision).toBe(1);
    });
  }
}

for (const ending of ["cancel", "outside"] as const) {
  test(`changing insertion slots then dropping ${ending} leaves the board untouched`, async ({ page, boardState }) => {
    const before = structuredClone(boardState);
    let writes = 0;
    page.on("request", request => { if (request.url().endsWith("/api/board/actions")) writes++; });
    await pointerStart(page);
    for (const index of [0, 1, 2, 1, 0]) {
      await pointerSlot(page, index);
      await expect(column(page).locator(".insertion-preview")).toBeVisible();
    }
    if (ending === "cancel") await page.keyboard.press("Escape");
    else {
      const frame = await visibleBoardFrame(page);
      await page.mouse.move(frame.x - 5, frame.y + 5, { steps: 10 });
      await expect(column(page).locator(".insertion-preview")).toHaveCount(0);
    }
    await page.mouse.up();
    await expect(page.locator(".drag-preview")).toHaveCount(0);
    await expect(column(page).getByRole("article")).toHaveCount(2);
    await expect(page.getByRole("region", { name: "Ideas column", exact: true }).getByTestId("card-c1")).toBeAttached();
    expect(boardState).toEqual(before);
    expect(writes).toBe(0);
  });
}

test("inserts into the current destination order after it has been reordered", async ({ page, boardState }) => {
  const first = page.getByTestId("card-c4");
  await first.scrollIntoViewIfNeeded();
  await first.press("Space");
  await expect(first).toHaveClass(/is-dragging/);
  await expectKeyboardDropTarget(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("status")).toContainText("Planned, position 2 of 2");
  await page.keyboard.press("Space");
  await expect(page.locator(".save-status")).toHaveText("Saved");
  expect(boardState.columns[1].cards.map(card => card.id)).toEqual(["c5", "c4"]);
  await pointerStart(page);
  await pointerSlot(page, 1);
  await expect(column(page).locator(".insertion-preview")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".save-status")).toHaveText("Saved");
  expect(boardState.columns[1].cards.map(card => card.id)).toEqual(["c5", "c1", "c4"]);
  expect(boardState.revision).toBe(2);
});
