import { type Locator, type Page } from "@playwright/test";
import { expect, test, expectKeyboardDropTarget } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Project board", level: 1 })).toBeVisible();
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
  const cards = column.getByRole("article");
  const lastCard = await cards.count() ? await cards.last().boundingBox() : null;
  const targetY = lastCard ? lastCard.y + lastCard.height + 12 : to.y + 80;
  // This wide-board scenario keeps both endpoints beside the persistent assistant.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 5 });
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(to.x + to.width / 2, targetY, { steps: 15 });
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
  await expectKeyboardDropTarget(page);
  await page.keyboard.press("ArrowRight");
  // Scrolling between rows updates the drop target asynchronously on narrow screens.
  await expect(page.getByRole("region", { name: `${target} column`, exact: true })).toHaveClass(/is-over/);
  await page.keyboard.press(cancel ? "Escape" : "Space");
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await expect(handle).toBeFocused();
}

test("opens one board with five columns and dummy data", async ({ page }) => {
  await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(5);
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("creates cards with and without details in their selected columns", async ({ page }) => {
  await addCard(page, "Planned", "  A new task  ", "  Context for this task  ");
  await expect(page.getByRole("region", { name: "Planned column", exact: true }).getByRole("heading", { name: "A new task" })).toBeVisible();
  await expect(page.getByText("Context for this task", { exact: true })).toBeVisible();
  await addCard(page, "Ideas", "Title only");
  await expect(page.getByRole("heading", { name: "Title only" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(14);
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
    await page.getByTestId(`card-${card}`).getByRole("button", { name: /^Delete / }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
  }
  await expect(done.getByRole("article")).toHaveCount(0);
  await expect(done.getByText("Drop a card here or add one below.")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(10);
  await addCard(page, "Done", "First card back");
  await expect(done.getByRole("heading", { name: "First card back" })).toBeVisible();
  await expect(done.getByText("Drop a card here or add one below.")).toHaveCount(0);
});

test("keeps a flush card strip and reveals deletion on hover, focus, and touch", async ({ page }) => {
  const card = page.getByTestId("card-c1");
  const title = card.getByRole("heading");
  const handle = card.getByRole("button", { name: /^Move / });
  const priority = card.getByRole("button", { name: /^Priority for / });
  const remove = card.getByRole("button", { name: /^Delete / });
  const trash = remove.locator("svg");
  await expect(page).toHaveTitle(/Forma/);
  await expect(title).toBeVisible();
  await expect(handle.locator("svg")).toHaveCount(0);
  const cardBounds = (await card.boundingBox())!;
  const [left, middle, right] = await Promise.all([handle.boundingBox(), priority.boundingBox(), remove.boundingBox()]);
  expect(left).toMatchObject({ x: cardBounds.x, y: cardBounds.y });
  expect(middle).toMatchObject({ y: left!.y, height: left!.height });
  expect(right).toMatchObject({ y: left!.y, height: left!.height, width: left!.width });
  expect(middle!.x).toBeCloseTo(left!.x + left!.width);
  expect(right!.x).toBeCloseTo(middle!.x + middle!.width);
  expect(right!.x + right!.width).toBeCloseTo(cardBounds.x + cardBounds.width);
  const titleBounds = (await title.boundingBox())!;
  const detailsBounds = (await card.locator("p").boundingBox())!;
  expect(titleBounds.x).toBe(detailsBounds.x);

  const canHover = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
  await expect(trash).toHaveCSS("opacity", canHover ? "0" : "1");
  if (canHover) {
    const restingHandle = await handle.evaluate(element => getComputedStyle(element).backgroundImage);
    const restingRemove = await remove.evaluate(element => getComputedStyle(element).backgroundImage);
    await handle.hover();
    await expect(handle).toHaveCSS("cursor", "grab");
    await expect(handle).not.toHaveCSS("background-image", restingHandle);
    await expect(trash).toHaveCSS("opacity", "1");
    await title.hover();
    await page.mouse.down();
    await page.mouse.move(titleBounds.x + titleBounds.width / 2 + 10, titleBounds.y + titleBounds.height / 2);
    await expect(handle).not.toHaveAttribute("aria-pressed", "true");
    await page.mouse.up();
    await remove.hover();
    await expect(remove).not.toHaveCSS("background-image", restingRemove);
    await remove.click();
    await expect(handle).not.toHaveAttribute("aria-pressed", "true");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(remove).toBeFocused();
    await page.mouse.move(0, 0);
    await page.keyboard.press("Shift+Tab");
    await expect(priority).toBeFocused();
    await expect(trash).toHaveCSS("opacity", "1");
    await page.keyboard.press("Tab");
    await expect(remove).toBeFocused();
    await page.keyboard.press("Enter");
  } else {
    await remove.tap();
  }
  await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(card).toHaveCount(0);
});

test("opens priority independently of dragging and applies or clears the tint before saving", async ({ page, boardState }, info) => {
  const card = page.getByTestId("card-c1");
  const priority = card.getByRole("button", { name: /^Priority for / });
  const handle = card.getByRole("button", { name: /^Move / });
  const menu = page.getByRole("menu", { name: /^Priority for / });
  const initialBounds = await card.boundingBox();
  await expect(priority).toHaveAccessibleName(/: None$/);
  if (info.project.name === "mobile") {
    await expect(priority.locator("svg")).toHaveCSS("opacity", "1");
    await priority.tap();
  } else {
    const resting = await priority.evaluate(element => getComputedStyle(element).backgroundColor);
    await expect(priority.locator("svg")).toHaveCSS("opacity", "0");
    await priority.hover();
    await expect(priority).not.toHaveCSS("background-color", resting);
    await expect(priority.locator("svg")).toHaveCSS("opacity", "1");
    await priority.click();
  }

  await expect(menu.getByRole("menuitemradio")).toHaveText(["No priority", "Low", "Medium", "High", "Urgent"]);
  await expect(menu.getByRole("menuitemradio", { name: "No priority" })).toBeFocused();
  const anchorBounds = (await priority.boundingBox())!;
  const menuBounds = (await menu.boundingBox())!;
  expect(menuBounds.y).toBe(anchorBounds.y + anchorBounds.height + 5);
  expect(menuBounds.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/board/actions", async route => { await pending; await route.fallback(); });
  try {
    if (info.project.name === "mobile") {
      await menu.getByRole("menuitemradio", { name: "Medium" }).tap();
    } else {
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitemradio", { name: "Medium" })).toBeFocused();
      await page.keyboard.press("Enter");
    }
    await expect(menu).toBeHidden();
    await expect(priority).toHaveAttribute("data-priority", "medium");
    // The level is named in the bar, not shown by color alone (issue #44).
    await expect(priority).toHaveText("Medium");
    await expect(priority).toBeFocused();
    await expect(handle).not.toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".drag-preview")).toHaveCount(0);
    expect(await card.boundingBox()).toEqual(initialBounds);
    expect(boardState.revision).toBe(0);
    // Other cards and lists stay inert during the save without dimming (issue #28).
    for (const control of [page.getByTestId("card-c2").locator(".delete-button"), page.getByRole("button", { name: "Delete list Ideas", exact: true })]) {
      await expect(control).toHaveAttribute("aria-disabled", "true");
      await expect(control).toHaveCSS("opacity", "1");
    }
  } finally { release(); }
  await expect(page.locator(".save-status")).toHaveText("Saved");
  await priority.press("Space");
  await expect(menu.getByRole("menuitemradio", { name: "Medium", checked: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(priority).toBeFocused();
  expect(boardState.revision).toBe(1);
  await priority.press("Space");
  await menu.getByRole("menuitemradio", { name: "No priority" }).click();
  await expect(menu).toBeHidden();
  await expect(priority).not.toHaveAttribute("data-priority");
  await expect(priority).toHaveAccessibleName(/: None$/);
  await expect(page.locator(".save-status")).toHaveText("Saved");
  expect(boardState.revision).toBe(2);
  if (info.project.name !== "mobile") {
    await page.setViewportSize({ width: 1900, height: 430 });
    const edgeCard = page.getByTestId("card-c12");
    await edgeCard.getByRole("button", { name: /^Priority for / }).click();
    await expect(menu).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Tab");
    await expect(menu).toBeHidden();
    await expect(edgeCard.getByRole("button", { name: /^Delete / })).toBeFocused();
  }
});

test("touch swipes scroll the board and holding the drag corner moves a card", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Uses Chromium touch input");
  await page.setViewportSize({ width: 390, height: 900 });
  const surface = page.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  const sensor = await page.context().newCDPSession(page);
  const { x, y, width, height } = (await surface.boundingBox())!;
  const center = { x: x + width / 2, y: y + height / 2 };
  await sensor.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [center] });
  for (const distance of [25, 55, 90, 120]) {
    await sensor.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: center.x, y: center.y - distance }] });
  }
  await sensor.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(20);
  await expect(surface).not.toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.scrollTo(0, 0));

  const second = (await page.getByTestId("card-c2").boundingBox())!;
  const target = { x: center.x, y: second.y + second.height / 2 };
  expect(target.y).toBeLessThan(page.viewportSize()!.height);
  await sensor.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [center] });
  await expect(surface).toHaveAttribute("aria-pressed", "true");
  await sensor.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [target] });
  await expect(page.locator(".drag-preview")).toBeVisible();
  await sensor.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expectCardOrder(page.getByRole("region", { name: "Ideas column", exact: true }), ["c2", "c1", "c3"]);
});

test("appends by pointer in populated and empty columns and reorders after a second arrival", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  const planned = page.getByRole("region", { name: "Planned column", exact: true });
  const done = page.getByRole("region", { name: "Done column", exact: true });
  await pointerMove(page, "c1", "Planned");
  await expectCardOrder(planned, ["c4", "c5", "c1"]);
  for (const card of ["c11", "c12"]) {
    await page.getByTestId(`card-${card}`).getByRole("button", { name: /^Delete / }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
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
  await expect(done).toHaveClass(/is-over/);
  await page.keyboard.press("ArrowUp");
  const liveRegion = page.getByRole("status").and(page.locator("[aria-live=assertive]"));
  await expect(liveRegion).toHaveText("Moving A small moment of delight to Done, position 1 of 2.");
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
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  }
  await expect(handle).toBeInViewport();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expectKeyboardDropTarget(page);
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
  await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
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
  expect(await scroll.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole("region", { name: "Done column", exact: true }).getByRole("button", { name: "Add a card" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("region", { name: "Done column", exact: true }).getByRole("button", { name: "Add a card" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.reload();
  await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });
});
