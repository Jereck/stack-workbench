import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export const development = { tag: "@development" };

export async function selectPro(page: Page) {
  const toggle = page.getByRole("combobox", {
    name: "Development tier",
    exact: true,
  });
  await toggle.selectOption("pro");
  await expect(toggle).toHaveValue("pro");
}

export async function openPro(page: Page) {
  await page.goto("/tools/integration-compare");
  await selectPro(page);
}
