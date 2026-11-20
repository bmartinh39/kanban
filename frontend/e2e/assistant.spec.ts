import { join } from "node:path";
import { tmpdir } from "node:os";
import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { closeAssistant, deleteCard, openAssistant } from "./board-controls";

const operation = (fields: Record<string, unknown>) => ({
  type: "create", list: null, sourceList: null, card: null, title: null, details: null, ...fields,
});
async function openChat(page: Page) {
  await page.goto("/");
  await expect(page).toHaveTitle(/Forma/);
  await openAssistant(page);
  await expect(page.getByRole("heading", { name: "AI Assistant", exact: true })).toBeVisible();
}
async function send(page: Page, text: string) {
  await page.getByLabel("What would you like to change?").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test("Enter sends once, Shift+Enter adds a newline, and composition does not send", async ({ page, boardState }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  await page.route("**/api/assistant", async route => {
    const body = route.request().postDataJSON();
    requests.push(body.messages.at(-1).content);
    await pending;
    await route.fulfill({ json: { message: "Done", revision: body.revision, operations: [operation({ list: "Planned", title: "Keyboard request" })] } });
  });
  await openChat(page);
  const input = page.getByLabel("What would you like to change?");
  await input.fill("   ");
  await input.press("Enter");
  await expect(input).toHaveValue("   ");
  await input.fill("Create Keyboard request");
  await input.press("Shift+Enter");
  await input.pressSequentially("in Planned");
  await expect(input).toHaveValue("Create Keyboard request\nin Planned");
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await input.dispatchEvent("keydown", { key: "Enter", keyCode: 229 });
  await input.dispatchEvent("keydown", { key: "Enter", repeat: true });
  expect(requests).toEqual([]);
  await expect(page.getByRole("log")).not.toContainText("You");
  await input.press("Enter");
  await expect(page.getByText("Thinking about your board...")).toBeVisible();
  await expect(input).toBeEmpty();
  await expect(input).toBeFocused();
  await input.fill("Next draft");
  await input.press("Enter");
  await expect(input).toHaveValue("Next draft");
  expect(requests).toEqual(["Create Keyboard request\nin Planned"]);
  release();
  await expect(page.getByRole("log")).toContainText('Created "Keyboard request" in Planned.');
  await expect(page.getByRole("heading", { name: "Keyboard request", exact: true })).toHaveCount(1);
  expect(boardState.revision).toBe(1);
  await expect(input).toHaveValue("Next draft");
  await expect(page.locator("nextjs-portal").filter({ hasText: "Runtime Error" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

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
  await closeAssistant(page);
  const card = page.getByRole("region", { name: "Done column" }).getByTestId(`card-${cardId}`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("Launch notes");
  await expect(card).toContainText("Ready for review");
  await expect(page.getByRole("article")).toHaveCount(13);
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
  await expect(page.getByRole("dialog", { name: "AI Assistant", exact: true }).getByRole("alert")).toContainText('List "Missing list" was not found');
  await send(page, "Create a card");
  await expect(page.getByRole("dialog", { name: "AI Assistant", exact: true }).getByRole("alert")).toContainText("OPENAI_API_KEY");
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
  await expect(page.getByRole("dialog", { name: "AI Assistant", exact: true }).getByRole("status")).toContainText("Thinking");
  await closeAssistant(page);
  await deleteCard(page.getByTestId("card-c1"));
  await expect(page.getByRole("article")).toHaveCount(11);
  release();
  await openAssistant(page);
  await expect(page.getByRole("dialog", { name: "AI Assistant", exact: true }).getByRole("alert")).toContainText("board changed");
  await expect(page.getByRole("article")).toHaveCount(11);
  await expect(page.getByRole("heading", { name: "Stale task" })).toHaveCount(0);
});

test("assistant explains a server connection failure and can retry without changing the board early", async ({ page, boardState }) => {
  let turn = 0;
  await page.route("**/api/assistant", route => {
    const revision = route.request().postDataJSON().revision;
    return turn++ === 0
      ? route.fulfill({ status: 502, json: { error: "The assistant server could not reach the AI provider. Check the server's internet access and try again. No changes were made." } })
      : route.fulfill({ json: { message: "Done", revision, operations: [operation({ list: "Planned", title: "Connection recovered" })] } });
  });
  await openChat(page);
  await send(page, "Create Connection recovered in Planned");
  const panel = page.getByRole("dialog", { name: "AI Assistant", exact: true });
  await expect(panel.getByRole("alert")).toContainText("server's internet access");
  await expect(page.getByLabel("What would you like to change?")).toHaveValue("Create Connection recovered in Planned");
  await expect(page.getByRole("article")).toHaveCount(12);
  expect(boardState.revision).toBe(0);
  await page.getByLabel("What would you like to change?").press("Enter");
  await expect(panel.getByRole("log")).toContainText('Created "Connection recovered" in Planned.');
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("article")).toHaveCount(13);
  expect(boardState.revision).toBe(1);
});

test("assistant opens beside the full-width board or as a mobile drawer and preserves chat", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/assistant", route => route.fulfill({ json: { message: "Which card?", revision: route.request().postDataJSON().revision, operations: [] } }));
  const narrow = info.project.name === "mobile";
  if (!narrow) await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page).toHaveTitle(/Forma/);
  const toggle = page.getByRole("button", { name: "Assistant", exact: true });
  const panel = page.getByRole("dialog", { name: "AI Assistant", exact: true });
  const board = page.getByLabel("Project board columns");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toHaveCount(0);
  const fullWidth = (await board.boundingBox())!.width;
  expect(fullWidth).toBeCloseTo((await page.getByRole("main").boundingBox())!.width);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.screenshot({ path: join(tmpdir(), `kanban-issue14-board-${info.project.name}.png`), scale: "css" });
  await toggle.press("Enter");
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const close = panel.getByRole("button", { name: "Close assistant" });
  await expect(close).toBeFocused();
  await expect.poll(() => panel.evaluate(element => element.matches(":modal"))).toBe(narrow);
  const bounds = (await panel.boundingBox())!;
  const boardBounds = (await board.boundingBox())!;
  if (narrow) {
    await board.evaluate(element => (element as HTMLElement).focus());
    await expect(close).toBeFocused();
    await expect.poll(async () => {
      const box = (await panel.boundingBox())!;
      return Math.round(box.y + box.height);
    }).toBe(page.viewportSize()!.height);
    expect(boardBounds.width).toBeCloseTo(fullWidth);
  } else {
    expect(bounds.y).toBeCloseTo(boardBounds.y);
    expect(bounds.x).toBeGreaterThan(boardBounds.x + boardBounds.width);
    expect(boardBounds.width).toBeLessThan(fullWidth);
  }
  await send(page, "Move a card");
  await expect(panel.getByRole("log")).toContainText("Which card?");
  const input = page.getByLabel("What would you like to change?");
  await input.fill("Keep this draft");
  await page.screenshot({ path: join(tmpdir(), `kanban-issue14-assistant-${info.project.name}.png`), scale: "css" });
  await input.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(toggle).toBeFocused();
  expect((await board.boundingBox())!.width).toBeCloseTo(fullWidth);
  await toggle.click();
  await expect(input).toHaveValue("Keep this draft");
  await expect(panel.getByRole("log")).toContainText("Which card?");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(input).toBeEmpty();
  await expect(panel.getByRole("log")).not.toContainText("Which card?");
  await expect(page.locator("nextjs-portal").filter({ hasText: "Runtime Error" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
