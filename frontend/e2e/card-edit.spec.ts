import { initialBoard } from "../app/board-state";
import { expect, test } from "./fixtures";

const typography = (element: Element) => {
  const style = getComputedStyle(element);
  return { fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color };
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("card-c1")).toBeVisible();
});

test("edits a title in place with the caret at the click, matching the card's look, and saves on Enter (issue #43)", async ({ page, boardState }) => {
  const card = page.getByTestId("card-c1");
  const heading = card.getByRole("heading");
  const resting = await heading.evaluate(typography);
  await heading.click({ position: { x: 40, y: 8 } });
  const title = card.getByRole("textbox", { name: /^Title for / });
  await expect(title).toBeFocused();
  const caret = await title.evaluate(element => (element as HTMLTextAreaElement).selectionStart);
  expect(caret).toBeGreaterThan(0);
  expect(caret).toBeLessThan(initialBoard[0].cards[0].title.length);
  expect(await title.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderTopWidth, resize: style.resize };
  })).toEqual({ background: "rgba(0, 0, 0, 0)", border: "0px", resize: "none" });
  expect(await title.evaluate(typography)).toEqual(resting);

  await title.fill("Refresh the homepage");
  await title.press("Enter");
  await expect(title).toHaveCount(0);
  await expect(heading).toHaveText("Refresh the homepage");
  await expect(heading).toBeFocused();
  expect(boardState.revision).toBe(1);
  expect(boardState.columns[0].cards[0]).toEqual({ ...initialBoard[0].cards[0], title: "Refresh the homepage" });
});

test("edits details with newlines, saves on blur, cancels on Escape, and adds details to an empty card", async ({ page, boardState }) => {
  const original = initialBoard[0].cards[1];
  const card = page.getByTestId("card-c2");
  const heading = card.getByRole("heading");
  const title = card.getByRole("textbox", { name: /^Title for / });
  const details = card.getByRole("textbox", { name: /^Details for / });

  await card.locator("p").click();
  await expect(details).toBeFocused();
  await details.fill("First line\nSecond line");
  await page.getByRole("heading", { name: "Project board" }).click();
  await expect(details).toHaveCount(0);
  await expect(card.locator("p")).toHaveText("First line\nSecond line");
  expect(boardState.revision).toBe(1);

  await heading.click();
  await title.fill("Discarded");
  await title.press("Escape");
  await expect(title).toHaveCount(0);
  await expect(heading).toHaveText(original.title);
  await expect(heading).toBeFocused();

  // Keyboard users start editing with Enter. An empty title is never saved; cleared details are.
  await heading.press("Enter");
  await expect(title).toBeFocused();
  await title.fill("");
  await details.fill("");
  await title.press("Enter");
  await expect(title).toHaveCount(0);
  await expect(heading).toHaveText(original.title);
  await expect(card.locator("p")).toHaveCount(0);
  expect(boardState.revision).toBe(2);
  expect(boardState.columns[0].cards[1]).toEqual({ ...original, details: "" });

  await heading.click();
  await expect(details).toHaveAttribute("placeholder", "Add details");
  await details.fill("Back again");
  await details.press("Control+Enter");
  await expect(card.locator("p")).toHaveText("Back again");
  expect(boardState.revision).toBe(3);
});

test("keeps the draft and shows the error when a save fails, then saves on retry", async ({ page, boardState }) => {
  const card = page.getByTestId("card-c3");
  await card.getByRole("heading").click();
  const title = card.getByRole("textbox", { name: /^Title for / });
  await page.route("**/api/board/actions", route => route.fulfill({ status: 503, json: { error: "Storage is unavailable." } }), { times: 1 });
  await title.fill("Draft that must survive");
  await title.press("Enter");
  await expect(card.getByRole("alert")).toContainText("Storage is unavailable.");
  await expect(title).toHaveValue("Draft that must survive");
  expect(boardState.revision).toBe(0);
  await title.press("Enter");
  await expect(title).toHaveCount(0);
  await expect(card.getByRole("alert")).toHaveCount(0);
  await expect(card.getByRole("heading")).toHaveText("Draft that must survive");
  expect(boardState.revision).toBe(1);
});
