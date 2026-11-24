import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
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
  await editor.press("Control+v");
  await parse(page, 4);

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

  await rows.first().locator("summary").first().press("Enter");
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
  await page.getByText("Original raw event", { exact: true }).click();
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
    .locator("summary")
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
  await editor.press("Control+z");
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
  await page.getByText("Original raw event", { exact: true }).click();
  await expect(page.getByLabel("Raw event", { exact: true })).toContainText(
    invalidJson,
  );
  await expect(
    page.getByText("Malformed or unsupported JSON was retained as raw text.", {
      exact: true,
    }),
  ).toBeVisible();

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
  await rows.nth(2).locator("summary").first().click();
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
