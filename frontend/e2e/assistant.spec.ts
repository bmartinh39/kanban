import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { assistantLauncher, assistantPanel, dismissAssistant, revealAssistant } from "./assistant-controls";

const operation = (fields: Record<string, unknown>) => ({
  type: "create", list: null, sourceList: null, card: null, title: null, details: null, ...fields,
});
async function openChat(page: Page) {
  await page.goto("/");
  await expect(page).toHaveTitle(/Forma/);
  await revealAssistant(page);
  await expect(assistantPanel(page)).toBeVisible();
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
  expect(boardState.revision).toBe(1);
  await expect(input).toHaveValue("Next draft");
  await dismissAssistant(page);
  await expect(page.getByRole("heading", { name: "Keyboard request", exact: true })).toHaveCount(1);
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
  await dismissAssistant(page);
  await expect(page.getByRole("region", { name: "Planned column" }).getByRole("heading", { name: "Release notes" })).toBeVisible();
  await revealAssistant(page);
  await send(page, "Rename Release notes to Launch notes and set details to Ready for review");
  await expect(page.getByRole("log")).toContainText('Updated "Launch notes".');
  await send(page, "Move Launch notes from Planned to Done");
  await expect(page.getByRole("log")).toContainText('Moved "Launch notes" to Done.');
  await dismissAssistant(page);
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
  await expect(assistantPanel(page).getByRole("alert")).toContainText('List "Missing list" was not found');
  await send(page, "Create a card");
  await expect(assistantPanel(page).getByRole("alert")).toContainText("OPENAI_API_KEY");
  await expect(page.getByLabel("What would you like to change?")).toHaveValue("Create a card");
  await dismissAssistant(page);
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
  await expect(assistantPanel(page).getByRole("status")).toContainText("Thinking");
  await dismissAssistant(page);
  await page.getByRole("button", { name: "Delete Give the homepage a fresh start", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(11);
  release();
  await revealAssistant(page);
  await expect(assistantPanel(page).getByRole("alert")).toContainText("board changed");
  await dismissAssistant(page);
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
  const panel = assistantPanel(page);
  await expect(panel.getByRole("alert")).toContainText("server's internet access");
  await expect(page.getByLabel("What would you like to change?")).toHaveValue("Create Connection recovered in Planned");
  await dismissAssistant(page);
  await expect(page.getByRole("article")).toHaveCount(12);
  expect(boardState.revision).toBe(0);
  await revealAssistant(page);
  await page.getByLabel("What would you like to change?").press("Enter");
  await expect(panel.getByRole("log")).toContainText('Created "Connection recovered" in Planned.');
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await dismissAssistant(page);
  await expect(page.getByRole("article")).toHaveCount(13);
  expect(boardState.revision).toBe(1);
});

test("a follow-up after a very long clarification is still accepted (issue #16)", async ({ page }) => {
  const sent: { role: string; content: string }[][] = [];
  await page.route("**/api/assistant", async route => {
    const body = route.request().postDataJSON();
    sent.push(body.messages);
    const message = sent.length === 1 ? "Which card do you mean? ".repeat(400) : "Got it.";
    await route.fulfill({ json: { message, operations: [], revision: body.revision } });
  });
  await openChat(page);
  await send(page, "Move that card");
  await expect(page.getByRole("log")).toContainText("Which card do you mean?");
  await send(page, "The first one");
  await expect(page.getByRole("log")).toContainText("Got it.");
  await expect(page.locator(".assistant-error")).toHaveCount(0);
  expect(sent[1].map(message => message.role)).toEqual(["user", "assistant", "user"]);
  expect(sent[1][1].content.length).toBeLessThanOrEqual(4_000);
});

test("desktop assistant stays visible, is keyboard accessible, and fits the viewport", async ({ page }) => {
  test.skip(page.viewportSize()!.width <= 700);
  await openChat(page);
  await expect(assistantLauncher(page)).toBeHidden();
  await page.getByLabel("What would you like to change?").fill("   ");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  const panel = page.getByRole("region", { name: "Board assistant", exact: true });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const board = await page.getByLabel("Project board columns").boundingBox();
  expect(board!.x + board!.width).toBeLessThanOrEqual(box!.x);
  expect((await page.getByRole("main").boundingBox())!.y).toBeCloseTo(box!.y, 0);
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

test("desktop assistant collapses to a top-bar launcher and reopens with its conversation and draft", async ({ page }) => {
  test.skip(page.viewportSize()!.width <= 700);
  await page.route("**/api/assistant", route => route.fulfill({ json: {
    message: "Which card do you mean?", operations: [], revision: route.request().postDataJSON().revision,
  } }));
  await openChat(page);
  const panel = assistantPanel(page);
  const launcher = assistantLauncher(page);
  const collapse = panel.getByRole("button", { name: "Collapse assistant" });
  const boardWidth = (await page.getByRole("main").boundingBox())!.width;
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await send(page, "Move that card");
  await expect(panel.getByRole("log")).toContainText("Which card do you mean?");
  await panel.getByRole("textbox").fill("Next draft");

  await collapse.click();
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await page.getByRole("main").boundingBox())!.width).toBeGreaterThan(boardWidth + 300);

  await launcher.press("Enter");
  await expect(panel).toBeVisible();
  await expect(launcher).toBeHidden();
  await expect(panel.getByRole("textbox")).toBeFocused();
  await expect(panel.getByRole("textbox")).toHaveValue("Next draft");
  await expect(panel.getByRole("log")).toContainText("Which card do you mean?");
  await expect.poll(async () => (await page.getByRole("main").boundingBox())!.width).toBeCloseTo(boardWidth, 0);
});

test("desktop collapse and expand morph the layout in one view transition, skipped for reduced motion (issue #38)", async ({ page }) => {
  test.skip(page.viewportSize()!.width <= 700);
  await openChat(page);
  const supported = await page.evaluate(() => {
    if (!document.startViewTransition) return false;
    const start = document.startViewTransition.bind(document);
    Object.assign(window, { viewTransitions: 0 });
    document.startViewTransition = (update => {
      (window as unknown as { viewTransitions: number }).viewTransitions++;
      return start(update);
    }) as typeof document.startViewTransition;
    return true;
  });
  test.skip(!supported, "This browser has no view transitions; the layout switches instantly.");
  const transitions = () => page.evaluate(() => (window as unknown as { viewTransitions: number }).viewTransitions);
  await expect(page.getByTestId("card-c1")).toHaveCSS("view-transition-name", "card-c1");
  await assistantPanel(page).getByRole("button", { name: "Collapse assistant" }).click();
  await expect(assistantLauncher(page)).toBeFocused();
  expect(await transitions()).toBe(1);
  await assistantLauncher(page).click();
  await expect(assistantPanel(page)).toBeVisible();
  expect(await transitions()).toBe(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await assistantPanel(page).getByRole("button", { name: "Collapse assistant" }).click();
  await expect(assistantPanel(page)).toBeHidden();
  expect(await transitions()).toBe(2);
});

test("mobile drawer opens over the board and keeps the conversation and draft after closing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/assistant", route => route.fulfill({ json: {
    message: "Which card do you mean?", operations: [], revision: route.request().postDataJSON().revision,
  } }));
  await page.goto("/");
  await expect(page).toHaveTitle(/Forma/);
  await expect(page.getByRole("heading", { name: "Project board" })).toBeVisible();
  const launcher = assistantLauncher(page);
  const drawer = page.getByRole("dialog", { name: "Board assistant" });
  await expect(drawer).toBeHidden();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await launcher.click();
  await expect(drawer.getByRole("button", { name: "Close assistant" })).toBeFocused();
  await expect(drawer).toBeInViewport();
  await expect.poll(async () => (await drawer.boundingBox())!.y + (await drawer.boundingBox())!.height).toBeCloseTo(664, 0);
  await launcher.evaluate(element => element.focus());
  await expect(drawer.getByRole("button", { name: "Close assistant" })).toBeFocused();
  await send(page, "Move that card");
  await expect(drawer.getByRole("log")).toContainText("Which card do you mean?");
  const input = drawer.getByRole("textbox");
  await input.fill("Next draft");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(drawer.getByRole("log")).toContainText("Which card do you mean?");
  await expect(input).toHaveValue("Next draft");
  await page.mouse.click(10, 80);
  await expect(drawer).toBeHidden();
  await expect(launcher).toBeFocused();
  await expect(page.locator("nextjs-portal").filter({ hasText: "Runtime Error" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
