import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { pasteText } from "../fixtures/editor-paste";

test(
  "runs the two local tools with keyboard access, workers, and downloads",
  { tag: "@release" },
  async ({ page, context, baseURL }) => {
    const marker = "synthetic-release-canary-4a76";
    const requests: string[] = [];
    const origins = new Set<string>();
    const errors: string[] = [];
    context.on("request", (request) => {
      origins.add(new URL(request.url()).origin);
      requests.push(
        request.url(),
        JSON.stringify(request.headers()),
        request.postData() ?? "",
      );
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => {
      requests.push(socket.url());
      socket.on("framesent", ({ payload }) => requests.push(String(payload)));
    });

    const securityHeaders = {
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": expect.stringContaining(
        "frame-ancestors 'none'",
      ),
    };
    const compareResponse = await page.request.get(
      "/tools/integration-compare",
    );
    expect(compareResponse.ok()).toBe(true);
    expect(compareResponse.headers()).toMatchObject(securityHeaders);
    const response = await page.goto("/tools/log-inspector");
    expect(response?.headers()).toMatchObject(securityHeaders);
    await expect(
      page.getByRole("button", { name: "Open local file" }),
    ).toBeEnabled();
    const editor = page.getByRole("textbox", { name: /Raw log text/ });
    await expect(editor).toHaveAttribute("aria-multiline", "true");
    await editor.press("Tab");
    await expect(
      page.getByRole("button", { name: "Expand editor" }),
    ).toBeFocused();
    await editor.focus();
    await pasteText(
      editor,
      JSON.stringify({
        message: "Release smoke fixture",
        responseBody: { marker, quantity: 1 },
      }),
    );
    await editor.press("ControlOrMeta+Enter");
    await expect(
      page.getByRole("status").filter({ hasText: /^Parsed 1 event/ }),
    ).toBeVisible();
    const event = page
      .getByRole("list", { name: "Log events", exact: true })
      .getByRole("button", { name: /Release smoke fixture/ });
    const details = page.getByRole("heading", { name: "Event 1", exact: true });
    await event.press("Enter");
    await expect(details).toBeFocused();
    await page.getByRole("button", { name: "Back to events" }).press("Enter");
    await expect(event).toBeFocused();

    await page.getByText("Export events", { exact: true }).press("Enter");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download JSON" }).press("Enter");
    const saved: unknown = JSON.parse(
      await readFile(await (await download).path(), "utf8"),
    );
    expect(saved).toMatchObject([{ message: "Release smoke fixture" }]);
    await event.press("Enter");
    await page
      .getByRole("button", { name: "Payloads", exact: true })
      .press("Enter");
    await page
      .getByText("JSON · response · properties.responseBody", { exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "Send as baseline", exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "Open Integration Compare" })
      .press("Enter");
    await expect(page).toHaveURL(/\/tools\/integration-compare$/);

    const baseline = page.getByRole("textbox", {
      name: "Baseline input",
      exact: true,
    });
    const target = page.getByRole("textbox", {
      name: "Target input",
      exact: true,
    });
    await expect(baseline).toHaveValue(JSON.stringify({ marker, quantity: 1 }));
    await page.getByLabel("Choose target file").setInputFiles({
      name: "synthetic-target.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ marker, quantity: 2 })),
    });
    await expect(target).toHaveValue(JSON.stringify({ marker, quantity: 2 }));
    await target.press("ControlOrMeta+Enter");
    await expect(
      page.getByRole("status").filter({ hasText: /^1 difference$/ }),
    ).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Search differences" });
    await search.press("q");
    await expect(search).toHaveValue("q");
    await expect(
      page.getByText("/quantity", { exact: true }).first(),
    ).toBeVisible();

    expect([...origins]).toEqual([baseURL]);
    expect(requests.join("\n")).not.toContain(marker);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }),
      ),
    ).not.toContain(marker);
  },
);
