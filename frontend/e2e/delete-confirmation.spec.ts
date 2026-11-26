import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "./fixtures";

for (const populated of [false, true]) {
  test(`${populated ? "populated" : "empty"} lists show an animated confirmation before deletion`, async ({ page, boardState }, info) => {
    boardState.columns = [{ id: "target", name: "Release planning", color: "#79bdf0", lane: 0, cards: populated ? [{ id: "task", title: "Retain until confirmed", details: "Context" }] : [] }];
    const before = structuredClone(boardState);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    await expect(page).toHaveTitle(/Forma/);
    const trigger = page.getByRole("button", { name: "Delete list Release planning", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Delete this list?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    expect(boardState).toEqual(before);
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await expect(dialog).toHaveCSS("animation-name", "confirmation-in");
    await expect(dialog.getByRole("button", { name: "Delete list", exact: true })).toHaveCSS("background-color", "rgb(250, 136, 154)");
    const bounds = (await dialog.boundingBox())!;
    const close = (await dialog.getByRole("button", { name: "Close dialog" }).boundingBox())!;
    expect(close.y - bounds.y).toBeLessThan(24);
    expect(bounds.x + bounds.width - (close.x + close.width)).toBeLessThan(24);
    if (info.project.name === "mobile") {
      expect(bounds.x).toBeCloseTo(0, 0);
      expect(bounds.y + bounds.height).toBeCloseTo(page.viewportSize()!.height, 0);
    }
    if (populated) await page.screenshot({ path: join(tmpdir(), `kanban-delete-confirmation-${info.project.name}.png`), scale: "css" });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveClass(/is-closing/);
    await expect(dialog).toHaveCSS("animation-name", "confirmation-out");
    await expect(dialog).toHaveCount(0);
    expect(boardState).toEqual(before);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole("button", { name: "Delete list", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(0);
    expect(boardState.columns).toEqual([]);
    expect(boardState.revision).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("reduced motion still closes confirmation and preserves cancelled lists", async ({ page, boardState }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Delete list Ideas", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(boardState.columns).toHaveLength(5);
  expect(boardState.revision).toBe(0);
});
