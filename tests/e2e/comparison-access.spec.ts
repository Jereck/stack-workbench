import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  development,
  openPro,
  selectPro,
} from "../fixtures/comparison-development";
import { logLines, transaction } from "../fixtures/comparison-session";

const route = "/tools/integration-compare";
const inspector = "/tools/log-inspector";
const compare = (page: Page) =>
  page.getByRole("button", { name: "Compare", exact: true });
const workflow = (page: Page, name: string) =>
  page
    .getByRole("group", { name: "Comparison workflow" })
    .getByRole("button", { name, exact: true });
const field = (page: Page, side: "Baseline" | "Target") =>
  page.getByRole("textbox", { name: side + " input", exact: true });
const send = (
  page: Page,
  kind: "payload" | "session",
  side: "baseline" | "target",
) =>
  page
    .getByRole("group", {
      name:
        kind === "payload"
          ? "Compare this payload"
          : "Compare this log session",
    })
    .getByRole("button", { name: "Send as " + side, exact: true });

async function inspectLogs(page: Page, text: string, eventCount: number) {
  await expect(
    page.getByRole("button", { name: "Open local file" }),
  ).toBeEnabled();
  await page.getByLabel("Choose log file").setInputFiles({
    name: "fixture.log",
    mimeType: "text/plain",
    buffer: Buffer.from(text),
  });
  await expect(
    page.getByText("Local file loaded. Parse logs to inspect it."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Parse logs" }).click();
  await expect(
    page.getByText(new RegExp("^Parsed " + eventCount + " event")),
  ).toBeVisible();
}

async function payload(page: Page, event: string, summary: string) {
  await page
    .getByRole("list", { name: "Log events", exact: true })
    .getByRole("button")
    .filter({ hasText: event })
    .click();
  await page.getByRole("button", { name: "Payloads", exact: true }).click();
  await page.getByText(summary, { exact: true }).click();
}

test("defaults to Free and ignores client-provided entitlement claims", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ url: baseURL!, name: "tier", value: "pro" }]);
  await page.addInitScript(() => {
    localStorage.setItem("stack-workbench-tier", "pro");
    sessionStorage.setItem("entitlements", '{"tier":"pro"}');
  });
  const response = await page.goto(route + "?tier=pro&entitlements=pro");
  if (process.env.CI) {
    await expect(
      page.getByRole("combobox", { name: "Development tier" }),
    ).toHaveCount(0);
    expect(await response?.text()).not.toContain(
      'aria-label="Development tier"',
    );
  } else {
    await expect(
      page.getByRole("combobox", { name: "Development tier" }),
    ).toHaveValue("free");
  }
  for (const [name, heading] of [
    ["Log sessions", "Log session comparison"],
    ["Batch", "Batch comparisons"],
    ["Profiles", "Saved comparison profiles"],
  ]) {
    await workflow(page, name!).click();
    await expect(
      page.getByRole("region", { name: heading, exact: true }),
    ).toContainText("Pro subscriptions aren’t available yet.");
  }
  await expect(
    page.getByRole("button", {
      name: /Run all pairs|New profile|Compare sessions/,
    }),
  ).toHaveCount(0);
  await workflow(page, "Payloads").click();
  await expect(
    page.getByLabel("Baseline format").locator("option[value=http]"),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Baseline format").locator("option[value=log]"),
  ).toBeDisabled();
  await field(page, "Baseline").fill("HTTP/1.1 200 OK\n\nok");
  await field(page, "Target").fill("HTTP/1.1 503 Unavailable\n\ndown");
  await compare(page).click();
  const scope = page.getByRole("region", {
    name: "Integration Compare workspace",
  });
  await expect(scope.getByRole("alert")).toContainText(
    "HTTP transaction comparison is a Pro feature.",
  );
  await expect(field(page, "Baseline")).toHaveValue("HTTP/1.1 200 OK\n\nok");
  await scope.getByLabel("Baseline format").selectOption("text");
  await scope.getByLabel("Target format").selectOption("text");
  await compare(page).click();
  await expect(scope.getByText("2 differences", { exact: true })).toBeVisible();
  await scope.getByText("Regression report Pro", { exact: true }).click();
  await expect(
    scope.getByText(
      /Export comparison evidence.*Pro subscriptions aren’t available yet/,
    ),
  ).toBeVisible();
  await expect(
    scope.getByRole("button", { name: "Download report" }),
  ).toHaveCount(0);
});

test("allows Free exact ignores and keeps advanced rules out of the comparison", async ({
  page,
}) => {
  await page.goto(route);
  await field(page, "Baseline").fill('{"items":[{"id":1}]}');
  await field(page, "Target").fill('{"items":[{"id":2}]}');
  await compare(page).click();
  await expect(page.getByText("1 difference", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await page.getByRole("button", { name: "New rule" }).click();
  await page.getByRole("textbox", { name: "Field path" }).fill("/items/*/id");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(
    page.getByText("This rule requires Pro. Free supports exact paths."),
  ).toBeVisible();
  await expect(page.getByText("1 difference", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Array matching" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Observed structure", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Field path" }).fill("/items/0/id");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByText("Equivalent under current rules")).toBeVisible();
});

test("stages two extracted JSON payloads and consumes the handoff in the same tab", async ({
  page,
  context,
}) => {
  const marker = "compare-handoff-canary-18f2a";
  const traffic: Promise<string>[] = [];
  const sockets: string[] = [];
  const consoleOutput: string[] = [];
  context.on("request", (request) =>
    traffic.push(
      request
        .allHeaders()
        .catch(() => request.headers())
        .then(
          (headers) =>
            request.url() +
            JSON.stringify(headers) +
            (request.postData() ?? ""),
        ),
    ),
  );
  page.on("console", (entry) => consoleOutput.push(entry.text()));
  page.on("websocket", (socket) => {
    sockets.push(socket.url());
    socket.on("framesent", ({ payload }) => sockets.push(String(payload)));
  });
  await page.goto(inspector);
  await inspectLogs(
    page,
    logLines(
      { message: "Baseline capture", responseBody: { marker, changed: 1 } },
      { message: "Target capture", responseBody: { marker, changed: 2 } },
    ),
    2,
  );
  const source = "JSON · response · properties.responseBody";
  await payload(page, "Baseline capture", source);
  await send(page, "payload", "baseline").click();
  await expect(page.getByLabel("Decoded payload")).toContainText(marker);
  await expect(page.getByText(/Payload as baseline ready/)).toBeVisible();
  await payload(page, "Target capture", source);
  await send(page, "payload", "target").click();
  await page.getByRole("button", { name: "Open Integration Compare" }).click();
  await expect(page).toHaveURL(new RegExp(route + "$"));
  await expect(field(page, "Baseline")).toHaveValue(
    JSON.stringify({ marker, changed: 1 }),
  );
  await expect(field(page, "Target")).toHaveValue(
    JSON.stringify({ marker, changed: 2 }),
  );
  await expect(
    page.getByText(
      "Received from Log Inspector. This input clears on refresh.",
      { exact: true },
    ),
  ).toHaveCount(2);
  await compare(page).click();
  await expect(page.getByText("1 difference", { exact: true })).toBeVisible();
  await page.reload();
  await expect(field(page, "Baseline")).toHaveValue("");
  await expect(field(page, "Target")).toHaveValue("");
  const entries = await page.evaluate(async () =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      history: history.state,
      indexedDB: (await indexedDB.databases()).map(({ name }) => name),
    }),
  );
  expect(entries).not.toContain(marker);
  expect((await Promise.all(traffic)).join("\n")).not.toContain(marker);
  expect(consoleOutput.join("\n") + sockets.join("\n")).not.toContain(marker);
});

test("transfers an XML payload as the target and discards staged inputs when cleared", async ({
  page,
}) => {
  await page.goto(inspector);
  const xml = '<orders xmlns="urn:synthetic"><order>demo</order></orders>';
  await inspectLogs(
    page,
    logLines({ message: "XML capture", responseBody: xml }),
    1,
  );
  await payload(
    page,
    "XML capture",
    "XML · response · properties.responseBody",
  );
  await send(page, "payload", "baseline").click();
  await page.getByRole("button", { name: "Clear staged inputs" }).click();
  await send(page, "payload", "target").click();
  await page
    .getByRole("navigation", { name: "Workspace tools" })
    .getByRole("link", { name: "All tools", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tools$/);
  await page.goBack();
  await expect(page.getByText(/Payload as target ready/)).toBeVisible();
  await page.getByRole("button", { name: "Open Integration Compare" }).click();
  await expect(field(page, "Baseline")).toHaveValue("");
  await expect(field(page, "Target")).toHaveValue(xml);
  await expect(page.getByLabel("Target format")).toHaveValue("xml");
});

test(
  "simulates Pro in development, transfers parsed sessions, and restores Free on refresh",
  development,
  async ({ page }) => {
    await openPro(page);
    const tier = page.getByRole("combobox", { name: "Development tier" });
    const nav = page.getByRole("navigation", { name: "Workspace tools" });
    await nav.getByRole("link", { name: "Log Inspector" }).click();
    await expect(page).toHaveURL(new RegExp(inspector + "$"));
    const before = logLines(...transaction({ environment: "dev" }));
    const after = logLines(...transaction({ environment: "qa", status: 502 }));
    await inspectLogs(page, before, 2);
    await send(page, "session", "baseline").click();
    await inspectLogs(page, after, 2);
    await send(page, "session", "target").click();
    await page
      .getByRole("button", { name: "Open Integration Compare" })
      .click();
    await expect(tier).toHaveValue("pro");
    const sessions = page.getByRole("region", {
      name: "Log session workspace",
    });
    await expect(
      sessions.getByRole("textbox", { name: "Baseline logs input" }),
    ).toHaveValue(before);
    await expect(
      sessions.getByRole("textbox", { name: "Target logs input" }),
    ).toHaveValue(after);
    await expect(sessions.getByLabel("Target session format")).toHaveValue(
      "ndjson",
    );
    await sessions.getByRole("button", { name: "Compare sessions" }).click();
    await expect(
      sessions
        .getByText("HTTP response changed from 200 to 502.", { exact: true })
        .first(),
    ).toBeVisible();
    await tier.selectOption("free");
    await workflow(page, "Log sessions").click();
    await expect(
      page.getByRole("region", { name: "Log session workspace" }),
    ).toHaveCount(0);
    await selectPro(page);
    await workflow(page, "Log sessions").click();
    await expect(
      sessions.getByRole("textbox", { name: "Baseline logs input" }),
    ).toHaveValue("");
    await page.reload();
    await expect(tier).toHaveValue("free");
    await expect(
      page.getByRole("button", { name: "Compare sessions" }),
    ).toHaveCount(0);
  },
);
