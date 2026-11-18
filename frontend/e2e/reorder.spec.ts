import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function pointerReorder(page: Page, targetId: string) {
  const handle = page.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  const target = page.getByTestId(targetId);
  await target.scrollIntoViewIfNeeded();
  const [from, to] = await Promise.all([handle.boundingBox(), target.boundingBox()]);
  const x = from!.x + from!.width / 2;
  const y = from!.y + from!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y);
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 10 });
  await expectPreview(target);
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

test("pointer reorders between unequal-height cards without changing their contents", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Mouse drag coverage");
  const ideas = page.getByRole("region", { name: "Ideas column", exact: true });
  const originalContent = await cardContent(ideas);
  const heights = await ideas.getByRole("article").evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
  expect(new Set(heights).size).toBeGreaterThan(1);
  await expectOrder(ideas, originalOrder);
  await pointerReorder(page, "card-c2");
  await expectOrder(ideas, middleOrder);
  await pointerReorder(page, "card-c3");
  await expectOrder(ideas, lastOrder);
  await pointerReorder(page, "card-c2");
  await expectOrder(ideas, originalOrder);
  expect(await cardContent(ideas)).toEqual(originalContent);
  await expect(page.getByRole("article")).toHaveCount(12);
});

test("dropping in the gutter beside a clipped column leaves the order unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const ideas = page.getByRole("region", { name: "Ideas column", exact: true });
  const planned = page.getByRole("region", { name: "Planned column", exact: true });
  const scroll = page.getByLabel("Project board columns");
  const handle = ideas.getByTestId("card-c1").getByRole("button", { name: /^Move / });
  await handle.scrollIntoViewIfNeeded();

  const [source, board, clipped] = await Promise.all([
    handle.boundingBox(),
    scroll.boundingBox(),
    planned.boundingBox(),
  ]);
  const x = source!.x + source!.width / 2;
  const y = source!.y + source!.height / 2;
  const gutterX = Math.floor(board!.x + board!.width) + 8;
  expect(gutterX).toBeLessThan(390);
  expect(gutterX).toBeGreaterThan(clipped!.x);
  expect(gutterX).toBeLessThan(clipped!.x + clipped!.width);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 8, y);
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(ideas).toHaveClass(/is-over/);
  await page.mouse.move(gutterX, y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".drag-preview")).toHaveCount(0);

  await expectOrder(ideas, originalOrder);
  await expect(planned.getByTestId("card-c1")).toHaveCount(0);
});
