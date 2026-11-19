import { type Locator, type Page } from "@playwright/test";
import { expect, test, visibleBoardFrame } from "./fixtures";

const originalOrder = ["card-c1", "card-c2", "card-c3"];
const middleOrder = ["card-c2", "card-c1", "card-c3"];
const lastOrder = ["card-c2", "card-c3", "card-c1"];

async function expectOrder(ideas: Locator, expected: string[]) {
  await expect.poll(() => ideas.getByRole("article").evaluateAll(cards =>
    cards.map(card => card.getAttribute("data-testid"))
  )).toEqual(expected);
}

async function cardContent(ideas: Locator) {
  return ideas.getByRole("article").evaluateAll(cards => cards.map(card => ({
    id: card.getAttribute("data-testid"),
    title: card.querySelector("h3")?.textContent,
    details: card.querySelector("p")?.textContent,
  })).sort((first, second) => first.id!.localeCompare(second.id!)));
}

async function expectPreview(target: Locator) {
  await expect.poll(() => target.evaluate(card => {
    const transform = getComputedStyle(card).transform;
    return transform === "none" ? 0 : new DOMMatrix(transform).m42;
  })).not.toBe(0);
}

async function keyboardReorder(page: Page, direction: "ArrowDown" | "ArrowUp", targets: string[]) {
  const handle = page.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  for (const target of targets) {
    await page.keyboard.press(direction);
    await expectPreview(page.getByTestId(target));
  }
  await page.keyboard.press("Space");
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
  await expect(handle).toBeFocused();
}

async function pointerReorder(page: Page, targetId: string, screenshot?: string) {
  const handle = page.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  const target = page.getByTestId(targetId);
  // Keep the drop point clear of the viewport's auto-scroll edge.
  await handle.evaluate(card => card.scrollIntoView({ block: "start", inline: "nearest" }));
  await page.evaluate(() => window.scrollBy(0, -80));
  const from = await handle.boundingBox();
  const x = from!.x + from!.width / 2;
  const y = from!.y + from!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y);
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await target.evaluate(card => card.scrollIntoView({ block: "center", inline: "nearest" }));
  // Scrolling can trigger a preview before the pointer moves. Aim at the layout slot.
  const to = await target.evaluate(card => {
    const bounds = card.getBoundingClientRect();
    const transform = getComputedStyle(card).transform;
    const offset = transform === "none" ? 0 : new DOMMatrix(transform).m42;
    return { x: bounds.x, y: bounds.y - offset, width: bounds.width, height: bounds.height };
  });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await expectPreview(target);
  if (screenshot) await page.screenshot({ path: screenshot, scale: "css" });
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".drag-preview")).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const rename = page.getByRole("button", { name: "Rename Ideas", exact: true });
  await rename.click();
  await expect(page.getByRole("textbox", { name: "Column name" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rename).toBeFocused();
});

test("keyboard reorders the same card to the middle, end, and start", async ({ page }) => {
  const ideas = page.getByRole("region", { name: "Ideas column", exact: true });
  const originalContent = await cardContent(ideas);
  await expectOrder(ideas, originalOrder);
  await keyboardReorder(page, "ArrowDown", ["card-c2"]);
  await expectOrder(ideas, middleOrder);
  await keyboardReorder(page, "ArrowDown", ["card-c3"]);
  await expectOrder(ideas, lastOrder);
  await keyboardReorder(page, "ArrowUp", ["card-c3", "card-c2"]);
  await expectOrder(ideas, originalOrder);
  expect(await cardContent(ideas)).toEqual(originalContent);
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("pointer reorders between unequal-height cards without changing their contents", async ({ page, boardState }, testInfo) => {
  boardState.columns[0].cards[0].details += " More context for this taller card.".repeat(6);
  await page.reload();
  const ideas = page.getByRole("region", { name: "Ideas column", exact: true });
  await expect(ideas.getByRole("article")).toHaveCount(3);
  const originalContent = await cardContent(ideas);
  const heights = await ideas.getByRole("article").evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
  expect(new Set(heights).size).toBeGreaterThan(1);
  await expectOrder(ideas, originalOrder);
  await pointerReorder(page, "card-c2", testInfo.outputPath("sorting-preview.png"));
  await expectOrder(ideas, middleOrder);
  await pointerReorder(page, "card-c3");
  await expectOrder(ideas, lastOrder);
  await pointerReorder(page, "card-c2");
  await expectOrder(ideas, originalOrder);
  expect(await cardContent(ideas)).toEqual(originalContent);
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("ignores keyboard boundary moves and cancels a sorting preview with focus restored", async ({ page }) => {
  const ideas = page.getByRole("region", { name: "Ideas column", exact: true });
  const originalContent = await cardContent(ideas);
  const first = ideas.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  const last = ideas.getByTestId("card-c3").getByRole("button", { name: /^Move / });

  for (const [handle, direction] of [[first, "ArrowUp"], [last, "ArrowDown"]] as const) {
    await handle.press("Space");
    await expect(handle).toHaveAttribute("aria-pressed", "true");
    await expect(ideas).toHaveClass(/is-over/);
    await page.keyboard.press(direction);
    await page.keyboard.press("Space");
    await expect(page.locator(".drag-preview")).toHaveCount(0);
    await expect(handle).toBeFocused();
    await expectOrder(ideas, originalOrder);
  }

  await first.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expectPreview(ideas.getByTestId("card-c2"));
  await expectOrder(ideas, originalOrder);
  await page.keyboard.press("Escape");
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await expect(first).toBeFocused();
  await expectOrder(ideas, originalOrder);
  expect(await cardContent(ideas)).toEqual(originalContent);
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("dropping in the gutter beside the board leaves the order unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const ideas = page.getByRole("region", { name: "Ideas column", exact: true });
  const planned = page.getByRole("region", { name: "Planned column", exact: true });
  const scroll = page.getByLabel("Project board columns");
  const originalContent = await cardContent(ideas);
  const handle = ideas.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  await handle.scrollIntoViewIfNeeded();

  const target = ideas.getByTestId("card-c2");
  const [source, board, nextCard] = await Promise.all([
    handle.boundingBox(),
    scroll.boundingBox(),
    target.boundingBox(),
  ]);
  const x = source!.x + source!.width / 2;
  const y = source!.y + source!.height / 2;
  const gutterX = Math.floor(board!.x + board!.width) + 8;
  expect(gutterX).toBeLessThan(390);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y);
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(ideas).toHaveClass(/is-over/);
  const targetY = nextCard!.y + nextCard!.height / 2;
  await page.mouse.move(x, targetY, { steps: 10 });
  await expectPreview(target);
  await page.mouse.move(gutterX, targetY, { steps: 10 });
  await expect(ideas).not.toHaveClass(/is-over/);
  await page.mouse.up();
  await expect(page.locator(".drag-preview")).toHaveCount(0);

  await expectOrder(ideas, originalOrder);
  await expect(planned.getByTestId("card-c1")).toHaveCount(0);
  expect(await cardContent(ideas)).toEqual(originalContent);
  await expect(page.getByRole("article")).toHaveCount(12);
});

for (const input of ["pointer", "keyboard"] as const) {
  for (const destination of ["Ideas", "Planned"] as const) {
    test(`${input} drop lands directly in ${destination} while the save is pending`, async ({ page, boardState }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      let release!: () => void;
      const saving = new Promise<void>(resolve => { release = resolve; });
      let writes = 0;
      await page.route("**/api/board/actions", async route => {
        writes++;
        await saving;
        await route.fallback();
      });
      // Record the real overlay animation endpoint, not just the eventual DOM order.
      await page.evaluate(() => {
        const animate = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
          const animation = animate.apply(this, args);
          const preview = this.querySelector(".drag-preview");
          if (preview) {
            const frames = (animation.effect as KeyframeEffect).getKeyframes();
            const last = new DOMMatrix(String(frames.at(-1)!.transform));
            const overlay = this as HTMLElement;
            const wrapperBounds = this.getBoundingClientRect();
            const previewBounds = preview.getBoundingClientRect();
            // Keep the evidence after the transient overlay is removed.
            document.body.dataset.landingX = String(parseFloat(overlay.style.left) + last.m41 + previewBounds.left - wrapperBounds.left);
            document.body.dataset.landingY = String(parseFloat(overlay.style.top) + last.m42 + previewBounds.top - wrapperBounds.top);
            const target = document.querySelector('[data-testid="card-c1"]')!.getBoundingClientRect();
            document.body.dataset.targetX = String(target.x);
            document.body.dataset.targetY = String(target.y);
          }
          return animation;
        };
      });
      const targetColumn = page.getByRole("region", { name: `${destination} column`, exact: true });
      const expectedOrder = destination === "Ideas" ? middleOrder : input === "pointer" ? ["card-c1", "card-c4", "card-c5"] : ["card-c4", "card-c5", "card-c1"];
      const handle = page.getByTestId("card-c1").getByRole("button", { name: /^Move / });
      try {
        if (input === "keyboard") {
          await handle.press("Space");
          await expect(handle).toHaveAttribute("aria-pressed", "true");
          await page.keyboard.press(destination === "Ideas" ? "ArrowDown" : "ArrowRight");
          if (destination === "Ideas") await expectPreview(page.getByTestId("card-c2"));
          else await expect(targetColumn).toHaveClass(/is-over/);
          await page.keyboard.press("Space");
        } else if (destination === "Ideas") {
          await pointerReorder(page, "card-c2");
        } else {
          await handle.evaluate(element => element.scrollIntoView({ block: "start" }));
          await page.evaluate(() => window.scrollBy(0, -80));
          const from = await handle.boundingBox();
          const x = from!.x + from!.width / 2;
          const y = from!.y + from!.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 8, y);
          await expect(handle).toHaveAttribute("aria-pressed", "true");
          await targetColumn.locator(".column-header").evaluate(element => element.scrollIntoView({ block: "start" }));
          await page.evaluate(() => window.scrollBy(0, -80));
          const target = await targetColumn.boundingBox();
          const frame = await visibleBoardFrame(page);
          // Keep the point within the page area above the mobile assistant.
          const left = Math.max(target!.x, frame!.x);
          const right = Math.min(target!.x + target!.width, frame!.x + frame!.width);
          await page.mouse.move((left + right) / 2, Math.min(target!.y + 80, frame!.y + frame!.height / 2), { steps: 10 });
          await expect(targetColumn).toHaveClass(/is-over/);
          await page.mouse.up();
        }
        await expect(page.locator(".save-status")).toHaveText("Saving...");
        await expectOrder(targetColumn, expectedOrder);
        await expect(page.locator(".drag-preview")).toHaveCount(0);
        const card = targetColumn.getByTestId("card-c1");
        await expect(card).toHaveCSS("opacity", "1");
        // Compare in the same frame: mobile scroll containers can continue scrolling.
        const landing = await page.evaluate(() => ({
          x: Number(document.body.dataset.landingX), y: Number(document.body.dataset.landingY),
          targetX: Number(document.body.dataset.targetX), targetY: Number(document.body.dataset.targetY),
        }));
        expect(landing.x).toBeCloseTo(landing.targetX, 0);
        expect(landing.y).toBeCloseTo(landing.targetY, 0);
        expect(boardState.revision).toBe(0);
        expect(writes).toBe(1);
      } finally { release(); }
      await expect(page.locator(".save-status")).toHaveText("Saved");
      await expectOrder(targetColumn, expectedOrder);
      if (input === "keyboard") await expect(targetColumn.getByRole("button", { name: /^Move Give the homepage/ })).toBeFocused();
      expect(boardState.revision).toBe(1);
      expect(writes).toBe(1);
      expect(errors).toEqual([]);
    });
  }
}

test("a rejected drop recovers the saved board without replaying the move", async ({ page, boardState }) => {
  let release!: () => void;
  const saving = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  await page.route("**/api/board/actions", async route => {
    writes++;
    await saving;
    // Another client has renamed the source column since our snapshot.
    boardState.columns[0].name = "Latest ideas";
    boardState.revision++;
    await route.fulfill({ status: 409, json: { error: "The board changed. Reload and retry." } });
  });
  const handle = page.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  const planned = page.getByRole("region", { name: "Planned column", exact: true });
  try {
    await handle.press("Space");
    await expect(handle).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("ArrowRight");
    await expect(planned).toHaveClass(/is-over/);
    await page.keyboard.press("Space");
    await expect(planned.getByTestId("card-c1")).toHaveCount(1);
    await expect(page.locator(".save-status")).toHaveText("Saving...");
  } finally { release(); }
  await expect(page.locator(".storage-error").getByRole("alert")).toHaveText("The board changed. Reload and retry.");
  await expectOrder(page.getByRole("region", { name: "Latest ideas column", exact: true }), originalOrder);
  await expectOrder(planned, ["card-c4", "card-c5"]);
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  expect(writes).toBe(1);
});
