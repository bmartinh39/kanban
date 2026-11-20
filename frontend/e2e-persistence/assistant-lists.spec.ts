import { expect, test } from "@playwright/test";
import { revealAssistant } from "../e2e/assistant-controls";
import type { BoardSnapshot } from "../app/board-commands";

test("assistant list changes persist only after confirmation through the real SQLite API", async ({ page }, info) => {
  const name = `Assistant list ${info.project.name}`;
  const renamed = `${name} renamed`;
  const read = async (): Promise<BoardSnapshot> => (await page.request.get("/api/board")).json();
  const before = await read();
  const operations = [
    { type: "create-list", list: null, title: name },
    { type: "rename-list", list: name, title: renamed },
    { type: "delete-list", list: renamed, title: null },
    { type: "delete-list", list: renamed, title: null },
  ];
  let turn = 0;
  await page.route("**/api/assistant", route => route.fulfill({ json: { message: "Proposed", revision: route.request().postDataJSON().revision, operations: [{ ...operations[turn++], sourceList: null, card: null, details: null }] } }));
  await page.goto("/");
  await revealAssistant(page);
  const input = page.getByLabel("What would you like to change?");
  for (const request of ["Create a list", "Rename that list"]) {
    await input.fill(request);
    await input.press("Enter");
    await expect(page.getByText("Thinking about your board...")).toHaveCount(0);
    await expect(input).toBeEmpty();
  }
  await expect(page.getByRole("log")).toContainText(`Renamed list "${name}" to "${renamed}"`);
  const saved = await read();
  expect(saved.columns.at(-1)).toMatchObject({ name: renamed, cards: [] });
  expect(saved.revision).toBe(before.revision + 2);
  await page.reload();
  await revealAssistant(page);
  await input.fill("Delete the list");
  await input.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Delete this list?" });
  await expect(dialog).toContainText(`Delete the empty list ${renamed}`);
  expect(await read()).toEqual(saved);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await read()).toEqual(saved);
  await input.fill("Delete the list");
  await input.press("Enter");
  await dialog.getByRole("button", { name: "Delete list", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(`Deleted list "${renamed}"`);
  await page.reload();
  const deleted = await read();
  expect(deleted.columns).toEqual(before.columns);
  expect(deleted.revision).toBe(saved.revision + 1);
  await expect(page.getByRole("region", { name: `${renamed} column`, exact: true })).toHaveCount(0);
});
