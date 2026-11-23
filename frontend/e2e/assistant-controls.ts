import type { Page } from "@playwright/test";

export function assistantPanel(page: Page) {
  return page.getByLabel("Board assistant", { exact: true });
}

export function assistantLauncher(page: Page) {
  return page.getByRole("button", { name: "AI Assistant", exact: true });
}

export async function revealAssistant(page: Page) {
  if (page.viewportSize()!.width <= 700) await assistantLauncher(page).click();
}

export async function dismissAssistant(page: Page) {
  if (page.viewportSize()!.width <= 700) await assistantPanel(page).getByRole("button", { name: "Close assistant" }).click();
}
