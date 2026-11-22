import { expect, test } from "./fixtures";

test("card deletion requires confirmation, cancels safely and restores focus", async ({ page, boardState }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const saves: unknown[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/board/actions")) saves.push(request.postDataJSON()); });
  await page.goto("/");
  await expect(page).toHaveTitle(/Forma/);
  const before = structuredClone(boardState);
  const card = page.getByTestId("card-c1");
  const trigger = card.getByRole("button", { name: "Delete Give the homepage a fresh start", exact: true });
  const dialog = page.getByRole("dialog", { name: "Delete this card?" });
  for (const method of ["Cancel", "Close dialog", "Escape", "backdrop"]) {
    await card.getByRole("heading").hover();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Give the homepage a fresh start");
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(dialog).toHaveCSS("animation-name", "confirmation-in");
    expect(boardState).toEqual(before);
    expect(saves).toHaveLength(0);
    if (method === "Escape") await page.keyboard.press("Escape");
    else if (method === "backdrop") await page.mouse.click(4, 4);
    else await dialog.getByRole("button", { name: method, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(boardState).toEqual(before);
    expect(saves).toHaveLength(0);
  }
  await card.getByRole("heading").hover();
  await trigger.click();
  await dialog.evaluate(element => Promise.allSettled(element.getAnimations().map(animation => animation.finished)));
  const bounds = (await dialog.boundingBox())!;
  if (info.project.name === "mobile") {
    expect(bounds.x).toBeCloseTo(0, 0);
    expect(bounds.y + bounds.height).toBeCloseTo(page.viewportSize()!.height, 0);
  } else {
    expect(bounds.x + bounds.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
  }
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Delete card", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Ideas column" }).getByRole("button", { name: "Add a card" })).toBeFocused();
  expect(saves).toEqual([{ revision: 0, actions: [{ type: "delete", cardId: "c1" }] }]);
  expect(boardState.revision).toBe(1);
  expect(boardState.columns).toEqual(before.columns.map(column => ({ ...column, cards: column.cards.filter(card => card.id !== "c1") })));
  expect(errors).toEqual([]);
});

test("reduced motion card confirmation supports cancellation and explicit deletion", async ({ page, boardState }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const title = page.getByTestId("card-c1").getByRole("heading");
  const trigger = page.getByRole("button", { name: "Delete Give the homepage a fresh start", exact: true });
  await title.hover();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(boardState.revision).toBe(0);
  await title.hover();
  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
  await expect(page.getByTestId("card-c1")).toHaveCount(0);
  expect(boardState.revision).toBe(1);
});

for (const status of [409, 503]) {
  test(`card deletion preserves cards after HTTP ${status} without replay`, async ({ page, boardState }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Delete Give the homepage a fresh start", exact: true });
    await expect(trigger).toBeVisible();
    const before = structuredClone(boardState);
    let writes = 0;
    await page.route("**/api/board/actions", route => {
      writes++;
      return route.fulfill({ status, json: { error: status === 409 ? "The board changed. Reload and retry." : "Board storage is unavailable." } });
    });
    await page.getByTestId("card-c1").getByRole("heading").hover();
    await trigger.click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete card", exact: true }).click();
    await expect(page.locator(".storage-error").getByRole("alert")).toContainText(status === 409 ? "changed" : "unavailable");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("card-c1")).toBeVisible();
    expect(boardState).toEqual(before);
    expect(writes).toBe(1);
    await expect(page.getByRole("region", { name: "Ideas column" }).getByRole("button", { name: "Add a card" })).toBeFocused();
  });
}
