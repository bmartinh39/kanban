import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The work, in view." })).toBeVisible();
  // Wait for hydration before interacting with client controls.
  await page.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Column name", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Escape");
});

async function addCard(page: Page, column: string, title: string, details = "") {
  const trigger = page.getByRole("region", { name: `${column} column`, exact: true }).getByRole("button", { name: "Add a card" });
  await trigger.click();
  await page.getByLabel("Title", { exact: false }).fill(title);
  if (details) await page.getByLabel("Details", { exact: false }).fill(details);
  await page.getByRole("button", { name: "Add card", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function expectCardOrder(column: Locator, ids: string[]) {
  await expect.poll(() => column.getByRole("article").evaluateAll(cards =>
    cards.map(card => card.getAttribute("data-testid"))
  )).toEqual(ids.map(id => `card-${id}`));
}

async function pointerMove(page: Page, cardId: string, target: string) {
  const handle = page.getByTestId(`card-${cardId}`).getByRole("button", { name: /^Move / });
  await handle.scrollIntoViewIfNeeded();
  const column = page.getByRole("region", { name: `${target} column`, exact: true });
  const from = (await handle.boundingBox())!;
  const to = (await column.boundingBox())!;
  // This wide-board scenario keeps both endpoints beside the persistent assistant.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 5 });
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(to.x + to.width / 2, from.y + from.height / 2, { steps: 15 });
  await expect(column).toHaveClass(/is-over/);
  await page.mouse.up();
  await expect(column.getByTestId(`card-${cardId}`)).toBeVisible();
  await expect(page.locator(".drag-preview")).toHaveCount(0);
}

async function keyboardMove(page: Page, title: string, target: string, cancel = false) {
  const handle = page.getByRole("button", { name: `Move ${title}`, exact: true });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  // Horizontal scrolling updates the drop target asynchronously on narrow screens.
  await expect(page.getByRole("region", { name: `${target} column`, exact: true })).toHaveClass(/is-over/);
  await page.keyboard.press(cancel ? "Escape" : "Space");
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await expect(handle).toBeFocused();
}

test("opens one board with five columns and dummy data", async ({ page }) => {
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(5);
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(page.getByText("12 cards", { exact: true })).toBeVisible();
});

test("creates cards with and without details in their selected columns", async ({ page }) => {
  await addCard(page, "Planned", "  A new task  ", "  Context for this task  ");
  await expect(page.getByRole("region", { name: "Planned column", exact: true }).getByRole("heading", { name: "A new task" })).toBeVisible();
  await expect(page.getByText("Context for this task", { exact: true })).toBeVisible();
  await addCard(page, "Ideas", "Title only");
  await expect(page.getByRole("heading", { name: "Title only" })).toBeVisible();
  await expect(page.getByText("14 cards", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(5);
});

test("rejects blank titles and cancels creation without changes", async ({ page }) => {
  const trigger = page.getByRole("region", { name: "Ideas column", exact: true }).getByRole("button", { name: "Add a card" });
  await trigger.click();
  await expect(page.getByLabel(/Title/)).toBeFocused();
  await expect(page.getByRole("button", { name: "Add card", exact: true })).toBeDisabled();
  await page.getByLabel(/Title/).fill("   ");
  await expect(page.getByRole("button", { name: "Add card", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByLabel(/Title/).fill("Discard this");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("traps dialog focus and closes through the close button", async ({ page }) => {
  await page.getByRole("button", { name: "Add a card" }).first().click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toHaveCount(0);
});

test("renames a column, rejects a blank name, and cancels edits", async ({ page }) => {
  await page.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("  ");
  await expect(page.getByRole("button", { name: "Save column name" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("  Backlog  ");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  const renamed = page.getByRole("region", { name: "Backlog column", exact: true });
  await expect(renamed).toBeVisible();
  await expect(renamed.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Rename Backlog", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Discarded");
  await page.getByRole("button", { name: "Cancel rename" }).click();
  await expect(renamed).toBeVisible();
  await expect(page.getByRole("button", { name: "Rename Backlog", exact: true })).toBeFocused();
});

test("deletes only selected cards and allows adding to an empty column", async ({ page }) => {
  const done = page.getByRole("region", { name: "Done column", exact: true });
  for (const card of ["c11", "c12"]) {
    await page.getByTestId(`card-${card}`).hover();
    await page.getByTestId(`card-${card}`).getByRole("button", { name: /^Delete / }).click();
  }
  await expect(done.getByRole("article")).toHaveCount(0);
  await expect(done.getByText("Drop a card here or add one below.")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(10);
  await addCard(page, "Done", "First card back");
  await expect(done.getByRole("heading", { name: "First card back" })).toBeVisible();
  await expect(done.getByText("Drop a card here or add one below.")).toHaveCount(0);
});

test("appends by pointer in populated and empty columns and reorders after a second arrival", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const planned = page.getByRole("region", { name: "Planned column", exact: true });
  const done = page.getByRole("region", { name: "Done column", exact: true });
  await pointerMove(page, "c1", "Planned");
  await expectCardOrder(planned, ["c4", "c5", "c1"]);
  for (const card of ["c11", "c12"]) {
    await page.getByTestId(`card-${card}`).hover();
    await page.getByTestId(`card-${card}`).getByRole("button", { name: /^Delete / }).click();
  }
  await expectCardOrder(done, []);
  await pointerMove(page, "c1", "Done");
  await expectCardOrder(done, ["c1"]);
  const onlyHandle = done.getByRole("button", { name: /^Move / });
  await onlyHandle.press("Space");
  await expect(onlyHandle).toHaveAttribute("aria-pressed", "true");
  await expect(done).toHaveClass(/is-over/);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await expect(onlyHandle).toBeFocused();
  await expectCardOrder(done, ["c1"]);

  await pointerMove(page, "c2", "Done");
  await expectCardOrder(done, ["c1", "c2"]);
  const secondHandle = done.getByTestId("card-c2").getByRole("button", { name: /^Move / });
  await secondHandle.press("Space");
  await expect(secondHandle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => done.getByTestId("card-c1").evaluate(card => card.style.transform)).toContain("translate3d");
  await page.keyboard.press("Space");
  await expectCardOrder(done, ["c2", "c1"]);
  await expect(secondHandle).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect(done.getByTestId("card-c1")).toContainText("Explore a quieter layout");
});

test("appends, cancels, and reorders by keyboard after scrolling, then persists on reload", async ({ page }, testInfo) => {
  const ideas = page.getByRole("region", { name: "Ideas column", exact: true });
  const planned = page.getByRole("region", { name: "Planned column", exact: true });
  const handle = planned.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  const title = "Give the homepage a fresh start";
  await keyboardMove(page, title, "Planned");
  await expectCardOrder(planned, ["c4", "c5", "c1"]);
  await expectCardOrder(ideas, ["c2", "c3"]);
  await expect(handle).toBeFocused();
  await keyboardMove(page, title, "In progress", true);
  await expectCardOrder(planned, ["c4", "c5", "c1"]);

  if (testInfo.project.name === "mobile") {
    const scroll = page.getByLabel("Project board columns");
    await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  }
  await expect(handle).toBeInViewport();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => planned.getByTestId("card-c5").evaluate(card => card.style.transform)).toContain("translate3d");
  await page.keyboard.press("Space");
  await expectCardOrder(planned, ["c4", "c1", "c5"]);
  await expect(handle).toBeFocused();
  await expect(page.getByRole("article")).toHaveCount(12);

  await page.reload();
  await expectCardOrder(ideas, ["c2", "c3"]);
  await expectCardOrder(planned, ["c4", "c1", "c5"]);
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("announces sorting a new card using its title, renamed column, and position", async ({ page }) => {
  await addCard(page, "Ideas", "Write release notes");
  await page.getByRole("button", { name: "Rename Ideas", exact: true }).click();
  const columnName = page.getByRole("textbox", { name: "Column name", exact: true });
  await columnName.fill("Incoming");
  await columnName.press("Enter");

  const incoming = page.getByRole("region", { name: "Incoming column", exact: true });
  const handle = incoming.getByRole("button", { name: "Move Write release notes", exact: true });
  const liveRegion = page.getByRole("status").and(page.locator("[aria-live=assertive]"));
  await handle.press("Space");
  await expect(incoming).toHaveClass(/is-over/);
  await expect(liveRegion).toHaveText("Picked up Write release notes in Incoming, position 4 of 4.");
  await page.keyboard.press("ArrowUp");
  await expect(liveRegion).toHaveText("Moving Write release notes to Incoming, position 3 of 4.");
  await page.keyboard.press("Space");
  await expect(liveRegion).toHaveText("Dropped Write release notes in Incoming, position 3 of 4.");
  await expect(incoming.getByRole("article").nth(2)).toContainText("Write release notes");
  await expect(handle).toBeFocused();

  await handle.press("Space");
  await expect(incoming).toHaveClass(/is-over/);
  await page.keyboard.press("ArrowRight");
  await expect(liveRegion).toHaveText("Moving Write release notes to Planned, position 3 of 3.");
  await page.keyboard.press("Escape");
  await expect(liveRegion).toHaveText("Cancelled moving Write release notes. It remains in Incoming, position 3 of 4.");
  await expect(incoming.getByRole("article").nth(2)).toContainText("Write release notes");
});

test("handles a complete workflow and persists changes on reload", async ({ page }) => {
  await addCard(page, "Ideas", "Session task", "Session details");
  await keyboardMove(page, "Session task", "Planned");
  const planned = page.getByRole("region", { name: "Planned column", exact: true });
  await expect(planned.getByRole("heading", { name: "Session task" })).toBeVisible();
  await page.getByRole("button", { name: "Rename Planned", exact: true }).click();
  await page.getByRole("textbox", { name: "Column name", exact: true }).fill("Next up");
  await page.getByRole("textbox", { name: "Column name", exact: true }).press("Enter");
  await page.getByRole("button", { name: "Delete Session task", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Session task" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Next up column", exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("wraps long content, scrolls all columns, and has no application errors", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await addCard(page, "Ideas", "A".repeat(180), "Long details ".repeat(50));
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "A".repeat(180) }) });
  expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const scroll = page.getByLabel("Project board columns");
  await scroll.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  await page.getByRole("region", { name: "Done column", exact: true }).getByRole("button", { name: "Add a card" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("region", { name: "Done column", exact: true }).getByRole("button", { name: "Add a card" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.reload();
  await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });
});
