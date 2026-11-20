import type { Locator, Page } from "@playwright/test";

export function listActions(page: Page, name: string) {
  return page.getByRole("button", { name: `List actions for ${name}`, exact: true });
}

export async function chooseListAction(page: Page, name: string, action: "Rename list" | "Delete list") {
  await listActions(page, name).click();
  await page.getByRole("button", { name: action, exact: true }).click();
}

export async function deleteCard(card: Locator) {
  await card.getByRole("button", { name: /^Card actions for / }).click();
  await card.getByRole("button", { name: "Delete card", exact: true }).click();
}

export function openAssistant(page: Page) {
  return page.getByRole("button", { name: "Assistant", exact: true }).click();
}

export function closeAssistant(page: Page) {
  return page.getByRole("button", { name: "Close assistant", exact: true }).click();
}
