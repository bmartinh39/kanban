import { expect, test } from "./fixtures";

test.beforeEach(async ({ page, boardState }) => {
  boardState.columns = Array.from({ length: 12 }, (_, index) => ({ id: `list-${index}`, name: `List ${index + 1}`, color: "#79bdf0", cards: [] }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Delete list List 7", exact: true })).toBeVisible();
});

for (const fails of [false, true]) {
  test(`${fails ? "failed" : "successful"} deletion below the fold preserves scroll`, async ({ page, boardState }) => {
    if (fails) await page.route("**/api/board/actions", route => route.fulfill({ status: 503, json: { error: "Board storage is unavailable." } }));
    const trigger = page.getByRole("button", { name: "Delete list List 7", exact: true });
    await trigger.evaluate(element => element.scrollIntoView({ block: "start" }));
    await page.evaluate(() => window.scrollBy(0, -80));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(boardState.columns).toHaveLength(12);
    await page.getByRole("dialog").getByRole("button", { name: "Delete list", exact: true }).click();
    if (fails) {
      await expect(page.locator(".storage-error").getByRole("alert")).toContainText("unavailable");
      expect(boardState.columns).toHaveLength(12);
    } else {
      await expect(trigger).toHaveCount(0);
      expect(boardState.columns).toHaveLength(11);
    }
    await expect(page.getByRole("button", { name: "Add list", exact: true })).toBeFocused();
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(80);
    await page.reload();
    await expect(page.getByRole("region", { name: / column$/ })).toHaveCount(fails ? 12 : 11);
  });
}

test("cancelling a populated list deletion preserves scroll and content", async ({ page, boardState }) => {
  boardState.columns[6].cards = [{ id: "retained", title: "Retained card", details: "Keep this" }];
  await page.reload();
  const trigger = page.getByRole("button", { name: "Delete list List 7", exact: true });
  await trigger.evaluate(element => element.scrollIntoView({ block: "start" }));
  await page.evaluate(() => window.scrollBy(0, -80));
  const before = await page.evaluate(() => window.scrollY);
  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThan(5);
  expect(boardState.columns[6].cards[0].id).toBe("retained");
});
