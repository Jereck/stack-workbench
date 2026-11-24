import { expect, test } from "@playwright/test";

test("finds the available Log Inspector on the homepage and in the directory", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Developer tools for the systems you depend on.",
  );
  await expect(
    page.getByRole("link", { name: "Open Log Inspector" }),
  ).toHaveAttribute("href", "/tools/log-inspector");
  await page.getByRole("link", { name: "Explore tools" }).click();
  await expect(page).toHaveURL(/\/tools$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Tools" }),
  ).toBeVisible();
  for (const name of ["Inspect", "Compare", "Validate", "Monitor"]) {
    await expect(page.getByRole("region", { name })).toBeVisible();
  }

  await page
    .getByRole("navigation", { name: "Tool categories" })
    .getByRole("link", { name: "Inspect" })
    .click();
  await expect(page).toHaveURL(/\/tools#inspect$/);
  const search = page.getByRole("searchbox", { name: "Search tools" });
  await search.fill("absent tool");
  await expect(
    page.getByText("No available tools found", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^Log Inspector/ })).toHaveCount(
    0,
  );
  await search.fill("soap");
  await page.getByRole("link", { name: /^Log Inspector/ }).click();
  await expect(page).toHaveURL(/\/tools\/log-inspector$/);
  await expect(page).toHaveTitle("Log Inspector | StackWorkbench");
  await expect(
    page.getByRole("heading", { name: "Log Inspector", level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Workspace tools" })
      .getByRole("link", { name: "Log Inspector" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByText("On-device processing", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Parse logs" })).toBeVisible();
  await page.getByRole("link", { name: "Format guide" }).click();
  await expect(
    page.getByRole("heading", { name: "Supported log formats" }),
  ).toBeVisible();
});

test("exposes informational pages and makes no third-party requests", async ({
  page,
  baseURL,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== baseURL)
      externalRequests.push(request.url());
  });

  const response = await page.goto("/");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  await page.getByRole("link", { name: "Explore tools" }).click();
  await page.getByRole("link", { name: /^Log Inspector/ }).click();
  await expect(
    page.getByRole("heading", { name: "Log Inspector" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Workspace tools" })
    .getByRole("link", { name: "About" })
    .click();
  await expect(
    page.getByRole("heading", { name: "About StackWorkbench" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Privacy" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacy" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Feedback" }).click();
  await expect(
    page.getByText("Feedback submissions are currently unavailable."),
  ).toBeVisible();
  await expect(page.locator("form, textarea, input")).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("returns a 404 for an unknown tool", async ({ page }) => {
  const response = await page.goto("/tools/unknown-tool");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Page not found", level: 1 }),
  ).toBeVisible();
});

test("supports mobile navigation, keyboard access, and saved theme preference", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );

  const toggle = page.getByRole("button", { name: "Dark theme" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Tools" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tools", level: 1 }),
  ).toBeVisible();
});

test("remembers workspace sidebar visibility without storing workspace data", async ({
  page,
}) => {
  await page.goto("/tools/log-inspector");
  const toggle = page.getByRole("button", { name: "Tool sidebar" });
  const navigation = page.getByRole("navigation", { name: "Workspace tools" });
  await expect(navigation).toBeVisible();
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toBeHidden();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toBeHidden();
  await toggle.click();
  await expect(navigation).toBeVisible();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({
    "stack-workbench-sidebar": "expanded",
  });
});
