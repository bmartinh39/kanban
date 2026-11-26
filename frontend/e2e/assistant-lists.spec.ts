import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { dismissAssistant, revealAssistant } from "./assistant-controls";

const listOperation = (type: string, list: string | null, title: string | null = null) => ({ type, list, title, card: null, sourceList: null, details: null });
async function send(page: Page, text: string) {
  const input = page.getByLabel("What would you like to change?");
  await input.fill(text);
  await input.press("Enter");
}

test("assistant creates and renames a list, then confirms empty-list deletion", async ({ page, boardState }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const operations = [listOperation("create-list", null, "Release"), listOperation("rename-list", "Release", "Shipped"), listOperation("delete-list", "Shipped")];
  let turn = 0;
  await page.route("**/api/assistant", route => route.fulfill({ json: { message: "Done", revision: boardState.revision, operations: [operations[turn++]] } }));
  await page.goto("/");
  await revealAssistant(page);
  await expect(page).toHaveTitle(/Forma/);
  await send(page, "Create Release");
  await expect(page.getByRole("log")).toContainText('Created list "Release".');
  const id = boardState.columns.at(-1)!.id;
  await send(page, "Rename Release to Shipped");
  await expect(page.getByRole("log")).toContainText('Renamed list "Release" to "Shipped".');
  expect(boardState.columns.at(-1)).toEqual({ id, name: "Shipped", color: "#6fd6a8", cards: [] });
  await send(page, "Delete Shipped, yes I confirm");
  const dialog = page.getByRole("dialog", { name: "Delete this list?" });
  await expect(dialog).toContainText("Delete the empty list Shipped?");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  expect(boardState.revision).toBe(2);
  await dialog.getByRole("button", { name: "Delete list", exact: true }).click();
  await expect(page.getByRole("log")).toContainText('Deleted list "Shipped"');
  await expect(page.getByLabel("What would you like to change?")).toBeFocused();
  expect(boardState.columns).toHaveLength(5);
  expect(boardState.revision).toBe(3);
  expect(errors).toEqual([]);
});

test("assistant cancellation by Cancel, Escape, or close preserves every action in a batch", async ({ page, boardState }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { message: "Already deleted", revision: boardState.revision, operations: [listOperation("create-list", null, "Do not create"), listOperation("delete-list", "Ideas")] } }));
  await page.goto("/");
  await revealAssistant(page);
  const before = structuredClone(boardState);
  for (const action of ["Cancel", "Escape", "Close dialog"]) {
    await send(page, "Create a list and delete Ideas");
    const dialog = page.getByRole("dialog", { name: /^Delete (this list|these lists)\?$/ });
    await expect(dialog).toContainText("Ideas also deletes its 3 cards");
    await expect(dialog).toContainText("Other changes in this request will be saved together");
    if (action === "Escape") await page.keyboard.press("Escape");
    else await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("log")).toContainText("Cancelled. No changes were made.");
    expect(boardState).toEqual(before);
    await expect(page.getByLabel("What would you like to change?")).toBeFocused();
  }
});

test("assistant confirms all deletions with accurate counts after earlier card moves", async ({ page, boardState }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { message: "Proposed", revision: boardState.revision, operations: [
    { type: "move", list: "Done", sourceList: "Ideas", card: "Give the homepage a fresh start", title: null, details: null },
    listOperation("delete-list", "Done"), listOperation("delete-list", "Planned"),
  ] } }));
  await page.goto("/");
  await revealAssistant(page);
  await send(page, "Move the homepage to Done then delete Done and Planned");
  const dialog = page.getByRole("dialog", { name: "Delete these lists?" });
  await expect(dialog).toContainText("Done also deletes its 3 cards");
  await expect(dialog).toContainText("Planned also deletes its 2 cards");
  expect(boardState.revision).toBe(0);
  await dialog.getByRole("button", { name: "Delete lists", exact: true }).click();
  await expect(page.getByRole("log")).toContainText('Deleted list "Planned"');
  expect(boardState.revision).toBe(1);
  expect(boardState.columns.map(column => column.name)).toEqual(["Ideas", "In progress", "In review"]);
  await dismissAssistant(page);
  await expect(page.getByRole("article")).toHaveCount(7);
});

test("assistant rejects a stale deletion confirmation without replaying the batch", async ({ page, boardState }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { message: "Proposed", revision: boardState.revision, operations: [listOperation("delete-list", "Ideas")] } }));
  await page.goto("/");
  await revealAssistant(page);
  await send(page, "Delete Ideas");
  const dialog = page.getByRole("dialog", { name: /^Delete (this list|these lists)\?$/ });
  await expect(dialog).toBeVisible();
  boardState.revision++;
  boardState.columns[0].cards.push({ id: "external", title: "Another tab's work", details: "Keep this" });
  const before = structuredClone(boardState);
  await dialog.getByRole("button", { name: "Delete list", exact: true }).click();
  await expect(page.locator(".assistant-error")).toContainText("board changed");
  await dismissAssistant(page);
  await expect(page.getByRole("heading", { name: "Another tab's work", exact: true })).toHaveCount(1);
  expect(boardState).toEqual(before);
});

test("invalid list batches leave the board unchanged without opening confirmation", async ({ page, boardState }) => {
  await page.route("**/api/assistant", route => route.fulfill({ json: { message: "Done", revision: boardState.revision, operations: [listOperation("create-list", null, "Do not create"), listOperation("delete-list", "Missing")] } }));
  await page.goto("/");
  await revealAssistant(page);
  await send(page, "Create Do not create and delete Missing");
  await expect(page.locator(".assistant-error")).toContainText("not found");
  await expect(page.getByRole("dialog", { name: /^Delete (this list|these lists)\?$/ })).toHaveCount(0);
  expect(boardState.revision).toBe(0);
  expect(boardState.columns).toHaveLength(5);
});
