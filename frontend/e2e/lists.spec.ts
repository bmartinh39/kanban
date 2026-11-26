import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Page } from "@playwright/test";
import { expect, test, visibleBoardFrame, expectKeyboardDropTarget } from "./fixtures";

const list = (page: Page, name: string) => page.getByRole("region", { name: `${name} column`, exact: true });
async function createList(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: "Add list", exact: true });
  await trigger.click();
  await page.getByLabel(/List name/).fill(name);
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".save-status")).toHaveText("Saved");
  await expect(trigger).toBeFocused();
  await expect(list(page, name.trim())).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add list", exact: true })).toBeVisible();
});

test("deletes a populated list and its cards only after confirmation", async ({ page, boardState }) => {
  const before = structuredClone(boardState);
  const trigger = page.getByRole("button", { name: "Delete list Ideas", exact: true });
  for (const action of ["Cancel", "Escape", "Close dialog", "backdrop"]) {
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Delete this list?" });
    await expect(dialog).toContainText("also deletes its 3 cards");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    if (action === "Escape") await page.keyboard.press("Escape");
    else if (action === "backdrop") await page.mouse.click(2, 2);
    else await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(boardState).toEqual(before);
  }
  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete list", exact: true }).click();
  await expect(list(page, "Ideas")).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(9);
  expect(boardState.columns).toEqual(before.columns.slice(1));
  await expect(page.getByRole("button", { name: "Add list", exact: true })).toBeFocused();
  await page.reload();
  await expect(list(page, "Ideas")).toHaveCount(0);
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(4);
});

test("deletes the last empty list and can create a fresh list", async ({ page, boardState }) => {
  boardState.columns = [{ id: "only", name: "Only", cards: [] }];
  await page.reload();
  await page.getByRole("button", { name: "Delete list Only", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Delete list", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(0);
  await expect(page.getByText("Add a list to get started.")).toBeVisible();
  expect(boardState.columns).toEqual([]);
  await createList(page, "Fresh");
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(1);
});

test("a stale list deletion reloads the latest board without removing cards", async ({ page, boardState }) => {
  const before = structuredClone(boardState);
  boardState.revision++;
  await page.getByRole("button", { name: "Delete list Ideas", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete list", exact: true }).click();
  await expect(page.locator(".storage-error").getByRole("alert")).toContainText("changed");
  expect(boardState.columns).toEqual(before.columns);
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("keyboard creation rejects blank names and every cancellation leaves the board unchanged", async ({ page, boardState }) => {
  const before = structuredClone(boardState);
  const trigger = page.getByRole("button", { name: "Add list", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const name = page.getByLabel(/List name/);
  await expect(name).toBeFocused();
  await expect(page.getByRole("button", { name: "Create list" })).toBeDisabled();
  await name.fill("   ");
  await name.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  for (const action of ["Cancel", "Close dialog", "backdrop"]) {
    await trigger.click();
    await name.fill("Discarded");
    if (action === "backdrop") await page.mouse.click(2, 2);
    else await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  expect(boardState).toEqual(before);
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(5);
});

test("creates empty trimmed lists, renames, adds cards, and reaches every list", async ({ page, boardState }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await expect(page).toHaveTitle(/Forma/);
  await createList(page, "  Released  ");
  await expect(list(page, "Released").getByRole("article")).toHaveCount(0);
  await expect(list(page, "Released")).toContainText("Drop a card here or add one below.");
  expect(boardState.columns[5].name).toBe("Released");
  await page.getByRole("button", { name: "Rename Released", exact: true }).click();
  await page.getByLabel("Column name", { exact: true }).fill("Shipped");
  await page.getByLabel("Column name", { exact: true }).press("Enter");
  await expect(list(page, "Shipped")).toBeVisible();
  await list(page, "Shipped").getByRole("button", { name: "Add a card" }).click();
  await page.getByLabel(/Title/).fill("New task");
  await page.getByLabel(/Details/).fill("Useful context");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(list(page, "Shipped").getByRole("heading", { name: "New task" })).toBeVisible();
  await createList(page, "Later");
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(7);
  await expect(page.getByRole("article")).toHaveCount(13);
  const first = (await list(page, "Ideas").boundingBox())!;
  const sixth = (await list(page, "Shipped").boundingBox())!;
  expect(sixth.y).toBeGreaterThan(first.y);
  expect(await page.getByLabel("Project board columns").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const widths = await page.getByRole("region", { name: / column$/ }).evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(220);
  for (const column of boardState.columns) {
    const target = list(page, column.name).getByRole("button", { name: `Rename ${column.name}`, exact: true });
    await target.focus();
    await expect(target).toBeInViewport();
  }
  await page.getByRole("button", { name: "Rename Shipped", exact: true }).focus();
  await page.getByRole("button", { name: "Rename Shipped", exact: true }).evaluate(element => element.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -80));
  const assistant = page.getByRole("region", { name: "Board assistant", exact: true });
  if (page.viewportSize()!.width <= 700) await expect(assistant).toBeHidden();
  else await expect(assistant).toBeInViewport();
  await page.screenshot({ path: join(tmpdir(), `kanban-issue3-${info.project.name}.png`) });
  await expect(page.locator("nextjs-portal").getByText(/error/i)).toHaveCount(0);
  expect(errors).toEqual([]);
  const saved = structuredClone(boardState);
  await page.reload();
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(7);
  expect(boardState).toEqual(saved);
});

for (const input of ["pointer", "keyboard"] as const) {
  test(`${input} moves cards into and out of a new list without losing content or IDs`, async ({ page, boardState }) => {
    await createList(page, "Released");
    const original = structuredClone(boardState.columns[4].cards[0]);
    const handle = () => page.getByTestId(`card-${original.id}`).getByRole("button", { name: /^Move / });
    for (const targetName of ["Released", "Done"]) {
      await expect(page.locator(".drag-preview")).toHaveCount(0);
      const target = list(page, targetName);
      if (input === "keyboard") {
        await handle().focus();
        await page.keyboard.press("Space");
        await expect(handle()).toHaveAttribute("aria-pressed", "true");
        await expectKeyboardDropTarget(page);
        await page.keyboard.press(targetName === "Released" ? "ArrowRight" : "ArrowLeft");
      } else {
        await handle().evaluate(element => element.scrollIntoView({ block: "start" }));
        await page.evaluate(() => window.scrollBy(0, -80));
        const source = (await handle().boundingBox())!;
        const x = source.x + source.width / 2;
        const y = source.y + source.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 9, y);
        await expect(handle()).toHaveAttribute("aria-pressed", "true");
        // Scroll while dragging so the destination fits inside the real board frame.
        await target.locator(".column-header").evaluate(element => element.scrollIntoView({ block: "center", inline: "center" }));
        const bounds = (await target.boundingBox())!;
        const frame = await visibleBoardFrame(page);
        const viewport = (await page.getByLabel("Project board columns").boundingBox())!;
        const left = Math.max(bounds.x, frame.x, viewport.x);
        const right = Math.min(bounds.x + bounds.width, frame.x + frame.width, viewport.x + viewport.width);
        await page.mouse.move((left + right) / 2, bounds.y + 75, { steps: 12 });
      }
      await expect(target).toHaveClass(/is-over/);
      if (input === "keyboard") await page.keyboard.press("Space");
      else await page.mouse.up();
      await expect(target.getByTestId(`card-${original.id}`)).toBeAttached();
      await expect(page.locator(".save-status")).toHaveText("Saved");
      await expect(page.locator(".drag-preview")).toHaveCount(0);
      expect(boardState.columns.find(column => column.name === targetName)!.cards.find(card => card.id === original.id)).toEqual(original);
      expect(boardState.columns.flatMap(column => column.cards)).toHaveLength(12);
    }
    expect(boardState.revision).toBe(3);
  });
}

for (const status of [409, 503]) {
  test(`list creation recovers from HTTP ${status} without replaying or showing an unsaved list`, async ({ page, boardState }) => {
    const before = structuredClone(boardState);
    let writes = 0;
    await page.route("**/api/board/actions", route => {
      writes++;
      return route.fulfill({ status, json: { error: status === 409 ? "The board changed. Reload and retry." : "Board storage is unavailable." } });
    });
    await page.getByRole("button", { name: "Add list", exact: true }).click();
    await page.getByLabel(/List name/).fill("Must not appear");
    await page.getByRole("button", { name: "Create list" }).click();
    await expect(page.locator(".storage-error").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(5);
    expect(boardState).toEqual(before);
    expect(writes).toBe(1);
  });
}

test("stacks a wrapped list directly under the list above it instead of under the tallest one", async ({ page, boardState }) => {
  test.skip(page.viewportSize()!.width <= 700, "Narrow screens show a single lane");
  const cards = Array.from({ length: 6 }, (_, index) => ({ id: `tall-${index}`, title: `Tall card ${index}`, details: "Details" }));
  boardState.columns = Array.from({ length: 8 }, (_, index) => ({ id: `l${index}`, name: `List ${index}`, cards: index ? [] : cards }));
  await page.reload();
  await expect.poll(() => page.locator(".board-lane").count()).toBeGreaterThan(1);
  const lanes = await page.locator(".board-lane").count();
  expect(lanes).toBeLessThan(8);
  const tall = await list(page, "List 0").boundingBox();
  const short = await list(page, "List 1").boundingBox();
  const wrapped = await list(page, `List ${lanes + 1}`).boundingBox();
  expect(wrapped!.x).toBeCloseTo(short!.x, 0);
  expect(wrapped!.y - (short!.y + short!.height)).toBeLessThanOrEqual(20);
  expect(wrapped!.y).toBeLessThan(tall!.y + tall!.height);
});
