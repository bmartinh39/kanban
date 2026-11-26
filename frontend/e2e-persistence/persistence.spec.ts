import { assistantPanel, revealAssistant } from "../e2e/assistant-controls";
import { expectKeyboardDropTarget } from "../e2e/fixtures";
import { expect, test, type Page } from "@playwright/test";
import type { BoardSnapshot } from "../app/board-commands";

async function open(page: Page) {
  await page.goto("/");
  await expect(page).toHaveTitle(/Forma/);
  await expect(page.getByRole("button", { name: "Rename Ideas", exact: true })).toBeVisible();
}
async function add(page: Page, title: string) {
  await page.getByRole("region", { name: "Ideas column", exact: true }).getByRole("button", { name: "Add a card" }).click();
  await page.getByLabel(/Title/).fill(title);
  await page.getByLabel(/Details/).fill("Saved context");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}
async function snapshot(page: Page): Promise<BoardSnapshot> { return (await page.request.get("/api/board")).json(); }

test("new lists and their cards persist, and competing list creation rejects stale revisions", async ({ page, context }, info) => {
  await open(page);
  const name = `Released ${info.project.name}`;
  const renamed = `Shipped ${info.project.name}`;
  const title = `List task ${info.project.name}`;
  const before = await snapshot(page);
  const other = await context.newPage();
  await open(other);
  await page.getByRole("button", { name: "Add list", exact: true }).click();
  await page.getByLabel(/List name/).fill(`  ${name}  `);
  await page.getByRole("button", { name: "Create list" }).click();
  const list = page.getByRole("region", { name: `${name} column`, exact: true });
  await expect(list).toBeVisible();
  await expect(list.getByRole("article")).toHaveCount(0);
  const created = await snapshot(page);
  expect(created.columns.at(-1)).toMatchObject({ name, cards: [] });
  expect(created.columns.slice(0, -1)).toEqual(before.columns);
  expect(created.revision).toBe(before.revision + 1);
  await other.getByRole("button", { name: "Add list", exact: true }).click();
  await other.getByLabel(/List name/).fill("Stale list must not save");
  await other.getByRole("button", { name: "Create list" }).click();
  await expect(other.locator(".storage-error").getByRole("alert")).toContainText("another tab");
  expect(await snapshot(other)).toEqual(created);
  await other.close();
  await list.getByRole("button", { name: `Rename ${name}`, exact: true }).click();
  await page.getByLabel("Column name", { exact: true }).fill(renamed);
  await page.getByLabel("Column name", { exact: true }).press("Enter");
  const target = page.getByRole("region", { name: `${renamed} column`, exact: true });
  await target.getByRole("button", { name: "Add a card" }).click();
  await page.getByLabel(/Title/).fill(title);
  await page.getByLabel(/Details/).fill("New list context");
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(target.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.locator(".save-status")).toHaveText("Saved");
  const content = (await snapshot(page)).columns.at(-1)!.cards[0];
  const handle = page.getByRole("article", { name: title, exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveClass(/is-dragging/);
  await expect(target).toHaveClass(/is-over/);
  await expectKeyboardDropTarget(page);
  await page.keyboard.press("ArrowLeft");
  const previous = page.getByRole("region", { name: `${created.columns.at(-2)!.name} column`, exact: true });
  await expect(previous).toHaveClass(/is-over/);
  await page.keyboard.press("Space");
  await expect(page.locator(".save-status")).toHaveText("Saved");
  await expect(handle).toHaveAttribute("aria-disabled", "false");
  await handle.press("Space");
  await expect(handle).toHaveClass(/is-dragging/);
  await expect(previous).toHaveClass(/is-over/);
  await expectKeyboardDropTarget(page);
  await page.keyboard.press("ArrowRight");
  await expect(target).toHaveClass(/is-over/);
  await page.keyboard.press("Space");
  await expect(page.locator(".save-status")).toHaveText("Saved");
  const saved = await snapshot(page);
  await page.reload();
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(saved.columns.length);
  expect(await snapshot(page)).toEqual(saved);
  expect(saved.columns.at(-1)).toEqual({ id: created.columns.at(-1)!.id, name: renamed, cards: [content] });
  await page.getByRole("button", { name: `Delete list ${renamed}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await snapshot(page)).toEqual(saved);
  await page.getByRole("button", { name: `Delete list ${renamed}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete list", exact: true }).click();
  await expect(page.getByRole("region", { name: `${renamed} column`, exact: true })).toHaveCount(0);
  await expect(page.locator(".save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(before.columns.length);
  const deleted = await snapshot(page);
  expect(deleted.columns).toEqual(before.columns);
  expect(deleted.revision).toBe(saved.revision + 1);
});

test("real database preserves card content, priority, names, moves and order on reload", async ({ page }, info) => {
  const title = `Persistent ${info.project.name}`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page);
  await add(page, title);
  const priority = page.getByRole("button", { name: `Priority for ${title}: None`, exact: true });
  await priority.click();
  await page.getByRole("menuitemradio", { name: "Medium", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved");
  const handle = page.getByRole("article", { name: title, exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveClass(/is-dragging/);
  await expect(page.getByRole("region", { name: "Ideas column" })).toHaveClass(/is-over/);
  await expectKeyboardDropTarget(page);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("status").and(page.locator("[aria-live=assertive]"))).toContainText(`Moving ${title} to Ideas`);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await snapshot(page)).columns[0].cards.at(-2)?.title).toBe(title);
  await expect(handle).toHaveAttribute("aria-disabled", "false");
  await handle.press("Space");
  await expect(handle).toHaveClass(/is-dragging/);
  await expect(page.getByRole("region", { name: "Ideas column" })).toHaveClass(/is-over/);
  await expectKeyboardDropTarget(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("region", { name: "Planned column" })).toHaveClass(/is-over/);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("status").and(page.locator("[aria-live=assertive]"))).toContainText(`Moving ${title} to Planned, position 2 of 3`);
  await page.keyboard.press("Space");
  await expect(page.getByRole("region", { name: "Planned column" }).getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rename Planned", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Next up");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(page.getByRole("region", { name: "Next up column" })).toBeVisible();
  const before = await snapshot(page);
  await page.reload();
  await expect(page.getByRole("region", { name: "Next up column" }).getByRole("heading", { name: title })).toHaveCount(1);
  expect(await snapshot(page)).toEqual(before);
  expect(before.columns[1].cards[1]).toMatchObject({ title, details: "Saved context", priority: "medium" });
  const reloadedPriority = page.getByRole("button", { name: `Priority for ${title}: Medium`, exact: true });
  await expect(reloadedPriority).toHaveAttribute("data-priority", "medium");
  await reloadedPriority.click();
  await page.getByRole("menuitemradio", { name: "No priority", exact: true }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByRole("button", { name: `Priority for ${title}: None`, exact: true })).not.toHaveAttribute("data-priority");
  expect((await snapshot(page)).columns[1].cards[1]).toEqual({ id: before.columns[1].cards[1].id, title, details: "Saved context" });
  await page.getByRole("button", { name: "Rename Next up", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Planned");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(page.getByRole("region", { name: "Planned column" })).toBeVisible();
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Rename Ideas", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath("persistent-board.png"), fullPage: true });
});

test("two tabs reject a stale save and reload canonical state", async ({ page, context }, info) => {
  const title = `Conflict ${info.project.name}`;
  await open(page);
  await add(page, title);
  const other = await context.newPage();
  await open(other);
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  await other.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  await other.getByRole("textbox", { name: "Column name", exact: true }).fill("Stale name");
  await other.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(other.locator(".storage-error").getByRole("alert")).toContainText("another tab");
  await expect(other.getByRole("heading", { name: title })).toHaveCount(0);
  await expect(other.getByRole("region", { name: "Ideas column" })).toBeVisible();
  expect((await snapshot(other)).columns[0].name).toBe("Ideas");
  await other.close();
});

test("controlled assistant proposals commit to the real database and stale proposals fail", async ({ page, context }, info) => {
  const title = `Assistant ${info.project.name}`;
  await open(page);
  await page.route("**/api/assistant", route => route.fulfill({ json: {
    revision: route.request().postDataJSON().revision,
    message: "Done", operations: [{ type: "create", list: "Ideas", sourceList: null, card: null, title, details: "Saved by assistant" }],
  } }));
  await revealAssistant(page);
  await page.getByLabel("What would you like to change?").fill("Create a card");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(`Created "${title}"`);
  await page.reload();
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
  const other = await context.newPage();
  await open(other);
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  // The controlled plan's revision matches this stale tab, but the real write API rejects it.
  await other.route("**/api/assistant", route => route.fulfill({ json: {
    revision: route.request().postDataJSON().revision, message: "Done",
    operations: [{ type: "create", list: "Ideas", sourceList: null, card: null, title: "Must not save", details: null }],
  } }));
  await revealAssistant(other);
  await other.getByLabel("What would you like to change?").fill("Create a card");
  await other.getByRole("button", { name: "Send", exact: true }).click();
  await expect(assistantPanel(other).getByRole("alert")).toContainText("another tab");
  expect((await snapshot(other)).columns.flatMap(column => column.cards).some(card => card.title === "Must not save")).toBe(false);
  await other.close();
});

test("failed saves preserve the board and expose retry feedback", async ({ page }) => {
  await open(page);
  const before = await snapshot(page);
  await page.route("**/api/board/actions", route => route.fulfill({ status: 503, json: { error: "Board storage is unavailable." } }));
  await page.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Should not save");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(page.locator(".storage-error").getByRole("alert")).toContainText("storage is unavailable");
  expect(await snapshot(page)).toEqual(before);
  await expect(page.getByRole("region", { name: "Ideas column" })).toBeVisible();
});
