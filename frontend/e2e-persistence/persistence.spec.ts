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

test("real database preserves card content, names, moves and order on reload", async ({ page }, info) => {
  const title = `Persistent ${info.project.name}`;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await open(page);
  await add(page, title);
  const handle = page.getByRole("button", { name: `Move ${title}`, exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Ideas column" })).toHaveClass(/is-over/);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("status").and(page.locator("[aria-live=assertive]"))).toContainText(`Moving ${title} to Ideas`);
  await page.keyboard.press("Space");
  await expect.poll(async () => (await snapshot(page)).columns[0].cards.at(-2)?.title).toBe(title);
  await expect(handle).toHaveAttribute("aria-disabled", "false");
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("region", { name: "Planned column" })).toHaveClass(/is-over/);
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
  expect(before.columns[1].cards.at(-1)).toMatchObject({ title, details: "Saved context" });
  await page.getByRole("button", { name: "Rename Next up", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Planned");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await expect(page.getByRole("region", { name: "Planned column" })).toBeVisible();
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
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
  await page.getByLabel("What would you like to change?").fill("Create a card");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(`Created "${title}"`);
  await page.reload();
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
  const other = await context.newPage();
  await open(other);
  await page.getByRole("button", { name: `Delete ${title}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  // The controlled plan's revision matches this stale tab, but the real write API rejects it.
  await other.route("**/api/assistant", route => route.fulfill({ json: {
    revision: route.request().postDataJSON().revision, message: "Done",
    operations: [{ type: "create", list: "Ideas", sourceList: null, card: null, title: "Must not save", details: null }],
  } }));
  await other.getByLabel("What would you like to change?").fill("Create a card");
  await other.getByRole("button", { name: "Send", exact: true }).click();
  await expect(other.getByRole("region", { name: "Board assistant", exact: true }).getByRole("alert")).toContainText("another tab");
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
