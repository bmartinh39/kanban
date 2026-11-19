import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const operation = (fields: Record<string, unknown>) => ({
  type: "create", list: null, sourceList: null, card: null, title: null, details: null, ...fields,
});
async function openChat(page: Page) {
  await page.goto("/");
  await expect(page).toHaveTitle(/Forma/);
  await expect(page.getByRole("region", { name: "Board assistant", exact: true })).toBeVisible();
  await expect(page.getByText("AI ASSISTANT", { exact: true })).toBeVisible();
}
async function send(page: Page, text: string) {
  await page.getByLabel("What would you like to change?").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test("assistant creates, edits and moves cards using the current board, then reload preserves it", async ({ page, boardState }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let turn = 0;
  let cardId = "";
  await page.route("**/api/assistant", async route => {
    const body = route.request().postDataJSON();
    expect(body.revision).toBe(boardState.revision);
    expect(body).not.toHaveProperty("board");
    expect(JSON.stringify(body)).not.toContain("OPENAI_API_KEY");
    const responses = [
      operation({ list: "Planned", title: "Release notes", details: "Write the draft" }),
      operation({ type: "edit", card: "Release notes", sourceList: "Planned", title: "Launch notes", details: "Ready for review" }),
      operation({ type: "move", card: "Launch notes", sourceList: "Planned", list: "Done" }),
    ];
    if (turn > 0) {
      const card = boardState.columns[1].cards.at(-1)!;
      expect(card.title).toBe(turn === 1 ? "Release notes" : "Launch notes");
      if (turn === 1) cardId = card.id;
      else expect(card.id).toBe(cardId);
      expect(body.messages).toHaveLength(turn * 2 + 1);
    }
    await route.fulfill({ json: { message: "Done", revision: body.revision, operations: [responses[turn++]] } });
  });
  await openChat(page);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await send(page, "Create Release notes in Planned with details Write the draft");
  await expect(page.getByRole("log")).toContainText('Created "Release notes" in Planned.');
  await expect(page.getByRole("region", { name: "Planned column" }).getByRole("heading", { name: "Release notes" })).toBeVisible();
  await send(page, "Rename Release notes to Launch notes and set details to Ready for review");
  await expect(page.getByRole("log")).toContainText('Updated "Launch notes".');
  await send(page, "Move Launch notes from Planned to Done");
  await expect(page.getByRole("log")).toContainText('Moved "Launch notes" to Done.');
  const card = page.getByRole("region", { name: "Done column" }).getByTestId(`card-${cardId}`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Launch notes");
  await expect(card).toContainText("Ready for review");
  await expect(page.getByText("13 cards", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(13);
  await expect(page.getByRole("heading", { name: "Launch notes" })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("assistant preserves cards on clarification, invalid targets and service failure", async ({ page }) => {
  let turn = 0;
  await page.route("**/api/assistant", async route => {
    const responses = [
      { message: "Which card do you mean?", operations: [] },
      { message: "Done", operations: [operation({ list: "Missing list", title: "Do not create" })] },
      { error: "The assistant is not configured yet. Set OPENAI_API_KEY on the server to enable it." },
    ];
    await route.fulfill({ status: turn === 2 ? 503 : 200, json: { ...responses[turn++], revision: route.request().postDataJSON().revision } });
  });
  await openChat(page);
  await send(page, "Move that card");
  await expect(page.getByRole("log")).toContainText("Which card do you mean?");
  await send(page, "Create Do not create in Missing list");
  await expect(page.getByRole("region", { name: "Board assistant", exact: true }).getByRole("alert")).toContainText('List "Missing list" was not found');
  await send(page, "Create a card");
  await expect(page.getByRole("region", { name: "Board assistant", exact: true }).getByRole("alert")).toContainText("OPENAI_API_KEY");
  await expect(page.getByLabel("What would you like to change?")).toHaveValue("Create a card");
  await expect(page.getByRole("article")).toHaveCount(12);
  await expect(page.getByRole("heading", { name: "Do not create" })).toHaveCount(0);
});

test("assistant rejects a stale reply and keeps the board's manual changes", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/assistant", async route => {
    await wait;
    await route.fulfill({ json: { message: "Done", revision: route.request().postDataJSON().revision, operations: [operation({ list: "Ideas", title: "Stale task" })] } });
  });
  await openChat(page);
  await send(page, "Create Stale task in Ideas");
  await expect(page.getByRole("region", { name: "Board assistant", exact: true }).getByRole("status")).toContainText("Thinking");
  await page.getByRole("button", { name: "Delete Give the homepage a fresh start", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(11);
  release();
  await expect(page.getByRole("region", { name: "Board assistant", exact: true }).getByRole("alert")).toContainText("board changed");
  await expect(page.getByRole("article")).toHaveCount(11);
  await expect(page.getByRole("heading", { name: "Stale task" })).toHaveCount(0);
});

test("assistant stays visible, is keyboard accessible, and fits the viewport", async ({ page }) => {
  await openChat(page);
  await page.getByLabel("What would you like to change?").fill("   ");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  const panel = page.getByRole("region", { name: "Board assistant", exact: true });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  if (page.viewportSize()!.width > 700) {
    const board = await page.getByLabel("Project board columns").boundingBox();
    expect(board!.x + board!.width).toBeLessThanOrEqual(box!.x);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(panel).toBeVisible();
  expect((await panel.boundingBox())!.y).toBeCloseTo(box!.y, 0);
  await page.getByLabel("What would you like to change?").fill("Create a card");
  await page.getByLabel("What would you like to change?").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
});
