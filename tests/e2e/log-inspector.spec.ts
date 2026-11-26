import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { pasteText } from "../fixtures/editor-paste";
import {
  browserLogs,
  deliberateHtml,
  invalidJson,
  privacyMarker,
  sensitive,
} from "../fixtures/log-inspector";

async function openInspector(page: Page) {
  await page.goto("/tools/log-inspector");
  await expect(
    page.getByRole("button", { name: "Open local file" }),
  ).toBeEnabled();
}

async function parse(page: Page, count: number) {
  await page.getByRole("button", { name: "Parse logs" }).click();
  await expect(
    page.getByText(new RegExp("^Parsed " + count + " event")),
  ).toBeVisible();
}

function editorModifier(page: Page) {
  // Monaco follows the browser's emulated platform, which can differ from the host.
  return page.evaluate(() =>
    navigator.userAgent.includes("Macintosh") ? "Meta" : "Control",
  );
}

test(
  "rejects oversized multicursor pastes and edits before changing the editor",
  { tag: "@release" },
  async ({ page }) => {
    await openInspector(page);
    const prefix = "alpha\nbeta\n";
    await page.getByLabel("Choose log file").setInputFiles({
      name: "near-limit.txt",
      mimeType: "text/plain",
      buffer: Buffer.concat([
        Buffer.from(prefix),
        Buffer.alloc(4 * 1024 * 1024 - 2 - prefix.length, "x"),
      ]),
    });
    await expect(
      page.getByText("Local file loaded. Parse logs to inspect it."),
    ).toBeVisible();

    const editor = page.getByRole("textbox", { name: /Raw log text/ });
    const lines = page.locator(".monaco-editor .view-line");
    const limit = page.getByText("Logs must be 4 MiB or smaller.", {
      exact: true,
    });
    const position = { x: 2, y: 8 };
    await lines.nth(0).click({ position });
    await lines.nth(1).click({ position, modifiers: ["Alt"] });
    await expect(
      page.locator(".monaco-editor .cursors-layer .cursor"),
    ).toHaveCount(2);
    await pasteText(editor, "é");
    await expect(limit).toBeVisible();
    await expect(lines.nth(0)).toHaveText("alpha");
    await expect(lines.nth(1)).toHaveText("beta");

    await pasteText(editor, "Z");
    await expect(lines.nth(0)).toHaveText("Zalpha");
    await expect(lines.nth(1)).toHaveText("Zbeta");
    await editor.press("End");
    await editor.press("n");
    await expect(lines.nth(0)).toHaveText("Zalpha");
    await expect(lines.nth(1)).toHaveText("Zbeta");
    const modifier = await editorModifier(page);
    await editor.press(modifier + "+z");
    await expect(lines.nth(0)).toHaveText("alpha");
    await expect(lines.nth(1)).toHaveText("beta");
    await editor.press(modifier === "Meta" ? "Meta+Shift+Z" : "Control+y");
    await expect(lines.nth(0)).toHaveText("Zalpha");
    await expect(lines.nth(1)).toHaveText("Zbeta");
  },
);

test(
  "enforces the UTF-8 limit on original clipboard text and preserves the current results",
  { tag: "@release" },
  async ({ page }) => {
    await openInspector(page);
    const editor = page.getByRole("textbox", { name: /Raw log text/ });
    const selectAll = (await editorModifier(page)) + "+a";
    await editor.focus();
    const prefix = "At the UTF-8 byte limit\n";
    await pasteText(
      editor,
      prefix + "x".repeat(4 * 1024 * 1024 - prefix.length),
    );
    await expect(page.locator(".monaco-editor .view-line").first()).toHaveText(
      prefix.trim(),
    );
    await editor.press(selectAll);
    await pasteText(editor, '{"message":"Original capture"}\r\n');
    await parse(page, 1);
    const events = page.getByRole("list", { name: "Log events", exact: true });
    await expect(
      events.getByRole("button", { name: /Original capture/ }),
    ).toBeVisible();
    await editor.press(selectAll);
    await pasteText(editor, "é".repeat(2 * 1024 * 1024) + "x");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Logs must be 4 MiB or smaller." }),
    ).toBeVisible();
    await expect(
      events.getByRole("button", { name: /Original capture/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/Showing results from the last parse/),
    ).toHaveCount(0);
    await parse(page, 1);
    await expect(
      events.getByRole("button", { name: /Original capture/ }),
    ).toBeVisible();
  },
);

test("pastes logs, explores results and downloads redacted copies locally", async ({
  page,
  context,
  baseURL,
}) => {
  const requests: { url: string; method: string; data: string }[] = [];
  const sockets: string[] = [];
  const errors: string[] = [];
  context.on("request", (request) =>
    requests.push({
      url: request.url(),
      method: request.method(),
      data: JSON.stringify(request.headers()) + (request.postData() ?? ""),
    }),
  );
  page.on("websocket", (socket) => {
    sockets.push(socket.url());
    socket.on("framesent", ({ payload }) => sockets.push(String(payload)));
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openInspector(page);
  await page.evaluate(
    (logs) => navigator.clipboard.writeText(logs),
    browserLogs,
  );
  const editor = page.getByRole("textbox", { name: /Raw log text/ });
  await editor.focus();
  await editor.press("ControlOrMeta+v");
  await editor.press("ControlOrMeta+Enter");
  await expect(page.getByText(/^Parsed 4 events/)).toBeVisible();

  await expect(page.getByText("Detected · JSON Lines / NDJSON")).toBeVisible();
  await page.getByText(/^Parsing warnings \(/).click();
  await expect(
    page.getByText(/Malformed or unsupported JSON was retained as raw text/),
  ).toBeVisible();
  await page.getByLabel("Sort events").selectOption("oldest");
  const rows = page
    .getByRole("list", { name: "Log events", exact: true })
    .getByRole("listitem");
  await expect(rows.first()).toContainText("Payment retry queued");
  await page.getByRole("searchbox", { name: "Search logs" }).fill("denied");
  await page.getByLabel("Severity", { exact: true }).selectOption("error");
  await expect(page.getByText("1 matching events")).toBeVisible();

  await rows.first().getByRole("button").press("Enter");
  await expect(
    page.getByRole("heading", { name: "Event 1", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Payloads", exact: true }).click();
  await page
    .getByText("JSON · response · properties.responseBody", { exact: true })
    .click();
  await expect(
    page.getByLabel("Decoded payload", { exact: true }),
  ).toContainText(deliberateHtml.replaceAll('"', '\\"'));
  await expect(page.locator("img[src*='example.invalid']")).toHaveCount(0);
  await page.getByText("Original encoded value", { exact: true }).click();
  await expect(
    page.getByLabel("Original value", { exact: true }),
  ).toContainText(sensitive.password);
  await page.getByRole("button", { name: "Raw event", exact: true }).click();
  await page.getByRole("button", { name: "Copy raw event" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(privacyMarker);
  // The clipboard was explicitly used above. Empty it for the test environment.
  await page.evaluate(() => navigator.clipboard.writeText(""));

  await page.getByText("Export events", { exact: true }).click();
  const first = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const json = await readFile(await (await first).path(), "utf8");
  expect(JSON.parse(json)).toHaveLength(1);
  expect(json).toContain("[REDACTED]");
  expect(json).not.toContain(sensitive.password);

  await page.getByRole("checkbox", { name: "Select event 1" }).check();
  await page
    .getByRole("searchbox", { name: "Search logs" })
    .fill("health check");
  await expect(page.getByText("0 matching events · 1 selected")).toBeVisible();
  await page.getByLabel("Export scope").selectOption("selected");
  await page.getByLabel("Export format").selectOption("text");
  const second = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download text" }).click();
  const readable = await readFile(await (await second).path(), "utf8");
  expect(readable).toContain("Upstream rejected request");
  expect(readable).not.toContain(sensitive.password);

  await page.getByRole("button", { name: "Correlations", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Find an identifier" })
    .fill("req-demo");
  await page
    .getByRole("button", { name: /Request ID req-demo 2 events/ })
    .click();
  await expect(page.getByText("2 matching events · 1 selected")).toBeVisible();
  await expect(rows).toHaveCount(2);

  await page.getByRole("button", { name: "Exceptions", exact: true }).click();
  await page
    .getByRole("list", { name: "Events with exceptions" })
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByText("Synthetic timeout", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Stack trace", { exact: true })).toContainText(
    "at Demo.Payment.Send()",
  );

  await page.getByRole("button", { name: "Clear workspace" }).click();
  await expect(
    page.getByText("Workspace cleared.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Results summary" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Parse logs" })).toBeDisabled();
  await expect(editor).toBeFocused();
  await editor.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: "Parse logs" })).toBeDisabled();
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    })),
  ).toEqual({ local: {}, session: {} });
  expect(
    requests.filter((request) => new URL(request.url).origin !== baseURL),
  ).toEqual([]);
  expect(
    requests.every((request) => ["GET", "HEAD"].includes(request.method)),
  ).toBe(true);
  expect(JSON.stringify({ requests, sockets })).not.toContain(privacyMarker);
  expect(errors).toEqual([]);
});

test("opens and drops local files, preserves malformed text, and handles worker failures", async ({
  page,
}) => {
  await openInspector(page);
  const input = page.getByLabel("Choose log file");
  await input.setInputFiles({
    name: "synthetic.ndjson",
    mimeType: "text/plain",
    buffer: Buffer.from(
      '{"msg":"ready"}\r\n' + invalidJson + '\n{"msg":"done"}',
    ),
  });
  await expect(
    page.getByText("Local file loaded. Parse logs to inspect it."),
  ).toBeVisible();
  await parse(page, 3);
  await page
    .getByRole("list", { name: "Log events", exact: true })
    .getByText(invalidJson, { exact: true })
    .click();
  await expect(
    page.getByText("Malformed or unsupported JSON was retained as raw text.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Raw event", exact: true }).click();
  await expect(page.getByLabel("Raw event", { exact: true })).toContainText(
    invalidJson,
  );

  await input.setInputFiles({
    name: "too-big.log",
    mimeType: "text/plain",
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByText("Logs must be 4 MiB or smaller.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("3 matching events")).toBeVisible();

  await input.setInputFiles({
    name: "bad-utf8.log",
    mimeType: "text/plain",
    buffer: Buffer.from([0xff, 0xff]),
  });
  await expect(page.getByText(/could not be read as UTF-8 text/)).toBeVisible();

  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(["[WARN] dropped synthetic text\nnext line"], "drop.log", {
        type: "text/plain",
      }),
    );
    return data;
  });
  await page
    .getByRole("region", { name: "Log input" })
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(
    page.getByText("Local file loaded. Parse logs to inspect it."),
  ).toBeVisible();
  await page.getByLabel("Log format", { exact: true }).selectOption("text");
  await page.evaluate(() => {
    const realWorker = window.Worker;
    window.Worker = new Proxy(realWorker, {
      construct() {
        window.Worker = realWorker;
        throw new Error("Synthetic worker startup failure");
      },
    });
  });
  await page.getByRole("button", { name: "Parse logs" }).click();
  await expect(
    page.getByText(/Parsing failed. Your input is still available/),
  ).toBeVisible();

  await page.evaluate(() => {
    const realWorker = window.Worker;
    window.Worker = class extends realWorker {
      postMessage() {
        window.Worker = realWorker;
      }
    };
  });
  await page.getByRole("button", { name: "Parse logs" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByText("Operation cancelled.", { exact: true }),
  ).toBeVisible();
  await parse(page, 2);
  await expect(
    page.getByText("dropped synthetic text", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Format override · Plain text / mixed"),
  ).toBeVisible();
});

test("loads an example and keeps the workbench usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openInspector(page);
  await page.getByLabel("Load synthetic example").selectOption("api");
  await parse(page, 4);
  await expect(page.getByText(/^Parsing warnings \(/)).toHaveCount(0);
  await expect(
    page.getByText("JSON Lines / NDJSON", { exact: true }).last(),
  ).toBeVisible();
  const rows = page
    .getByRole("list", { name: "Log events", exact: true })
    .getByRole("listitem");
  await rows.nth(2).getByRole("button").click();
  await page.getByRole("button", { name: "Payloads", exact: true }).click();
  await page
    .getByText("SOAP · response · properties.responseBody", { exact: true })
    .click();
  await expect(
    page.getByLabel("Decoded payload", { exact: true }),
  ).toContainText("Inventory timeout");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    360,
  );
});

test("keeps the paginated event list usable with input hidden and details open", async ({
  page,
}) => {
  await openInspector(page);
  await page.getByLabel("Choose log file").setInputFiles({
    name: "synthetic-page.log",
    mimeType: "text/plain",
    buffer: Buffer.from(
      Array.from(
        { length: 104 },
        (_, index) => "[INFO] Sample event " + (index + 1),
      ).join("\n"),
    ),
  });
  await expect(
    page.getByText("Local file loaded. Parse logs to inspect it."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hide input" }).click();
  const editor = page.getByRole("textbox", { name: /Raw log text/ });
  await expect(editor).toBeHidden();
  await parse(page, 104);

  const rows = page
    .getByRole("list", { name: "Log events", exact: true })
    .getByRole("listitem");
  const pager = page.getByRole("navigation", { name: "Results pages" });
  await expect(rows).toHaveCount(50);
  await rows.first().getByRole("button").click();
  await expect(
    page.getByRole("heading", { name: "Event 1", exact: true }),
  ).toBeVisible();
  await pager.getByRole("button", { name: "Next" }).click();
  await expect(pager).toContainText("Page 2 of 3");
  await expect(rows.first()).toContainText("Sample event 51");
  await expect(
    page.getByRole("heading", { name: "Event 1", exact: true }),
  ).toHaveCount(0);
  await pager.getByRole("button", { name: "Next" }).click();
  await expect(rows).toHaveCount(4);

  await page.getByRole("button", { name: "Clear workspace" }).click();
  await expect(editor).toBeFocused();
  await expect(rows).toHaveCount(0);
});
