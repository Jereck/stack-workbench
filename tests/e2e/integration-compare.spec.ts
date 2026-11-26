import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { development, openPro } from "../fixtures/comparison-development";
import {
  soapFault,
  syntheticExternalEntity,
} from "../fixtures/integration-compare";

const route = "/tools/integration-compare";
const baseline = (page: Page) =>
  page.getByRole("textbox", { name: "Baseline input" });
const target = (page: Page) =>
  page.getByRole("textbox", { name: "Target input" });
const compare = (page: Page) =>
  page.getByRole("button", { name: "Compare", exact: true });
const results = (page: Page) =>
  page.getByRole("region", { name: "Comparison results" });
const workspace = (page: Page) =>
  page.getByRole("region", { name: "Integration Compare workspace" });
const details = (page: Page) =>
  page.getByRole("region", { name: "Selected difference" });
const view = (page: Page, name: string) =>
  page
    .getByRole("group", { name: "Comparison view" })
    .getByRole("button", { name, exact: true });

test("discovers Integration Compare and serves an indexable Compare workspace", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /^Integration Compare/ }),
  ).toHaveAttribute("href", route);
  await page.getByRole("link", { name: "Explore tools" }).click();
  await page
    .getByRole("searchbox", { name: "Search tools" })
    .fill("integration compare");
  await page
    .getByRole("region", { name: "Compare" })
    .getByRole("link", { name: /^Integration Compare/ })
    .click();
  await expect(page).toHaveURL(new RegExp(route + "$"));
  await expect(page).toHaveTitle("Integration Compare | StackWorkbench");
  await expect(
    page.getByRole("heading", { name: "Integration Compare", level: 1 }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Workspace tools" });
  await expect(
    nav.getByRole("link", { name: "Integration Compare" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Log Inspector" })).toBeVisible();
  await expect(compare(page)).toBeDisabled();
  const response = await page.request.get(route);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain(
    "Compare payloads and recorded requests",
  );
  await page.getByRole("link", { name: "Format guide" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Compare payloads and recorded requests",
    }),
  ).toBeVisible();
});

test("pastes input, compares by keyboard, expands groups, filters and copies differences", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(route);
  await page.getByLabel("Baseline label").fill("DEV");
  await page.getByLabel("Target label").fill("QA");
  const before =
    '{"order":{"amount":12,"id":"sample","state":"ok"},"retain":true}';
  const after =
    '{"order":{"amount":"12","id":"sample","state":"pending"},"retain":true,"created":null}';
  await baseline(page).focus();
  await page.evaluate((text) => navigator.clipboard.writeText(text), before);
  await baseline(page).press(
    process.platform === "darwin" ? "Meta+v" : "Control+v",
  );
  await expect(baseline(page)).toHaveValue(before);
  await target(page).fill(after);
  await target(page).press(
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
  );
  await expect(
    results(page).getByText("3 differences", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Detected JSON", { exact: true })).toHaveCount(2);
  const group = results(page).getByRole("button", {
    name: "/order · 2 rows",
    exact: true,
  });
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "Inspect /order/amount" }),
  ).toHaveCount(0);
  await group.press("Space");
  await results(page).getByRole("button", { name: "Next difference" }).click();
  await expect(
    details(page).getByRole("heading", { name: "Added" }),
  ).toBeVisible();
  await results(page).getByRole("button", { name: "Next difference" }).click();
  await expect(
    details(page).getByRole("heading", { name: "Type changed" }),
  ).toBeVisible();
  await details(page).getByRole("button", { name: "Copy field path" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("/order/amount");
  await details(page)
    .getByRole("button", { name: "Copy target value" })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("12");
  await expect(
    results(page).getByRole("columnheader", { name: "DEV" }),
  ).toBeVisible();
  await expect(
    results(page).getByRole("columnheader", { name: "QA" }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search differences" })
    .fill("pending");
  await expect(
    page.getByRole("button", { name: "Inspect /order/state" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inspect /created" }),
  ).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search differences" }).clear();
  await page.getByLabel("Difference type").selectOption("unchanged");
  await expect(
    page.getByRole("button", { name: "Inspect /order/id" }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Differences only" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Swap inputs" }).click();
  await expect(baseline(page)).toHaveValue(after);
  await expect(page.getByLabel("Baseline label")).toHaveValue("QA");
  await expect(target(page)).toHaveValue(before);
  await expect(
    page.getByRole("region", { name: "Comparison results" }),
  ).toHaveCount(0);
  await compare(page).click();
  await page.getByRole("button", { name: "Inspect /created" }).click();
  await expect(
    details(page).getByRole("heading", { name: "Removed" }),
  ).toBeVisible();
});

test("manages path rules and automatically recomputes the current comparison", async ({
  page,
}) => {
  await page.goto(route);
  await baseline(page).fill('{"requestId":"dev","trace":"start","count":4}');
  await target(page).fill('{"requestId":"qa","trace":"end","count":4}');
  await compare(page).click();
  await expect(
    results(page).getByText("2 differences", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect /requestId" }).click();
  await details(page).getByRole("button", { name: "Ignore this path" }).click();
  await expect(
    results(page).getByText("1 difference", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Show ignored" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Inspect /requestId" }).click();
  await expect(
    details(page).getByText("Excluded by the selected rule."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rules (1)", exact: true }).click();
  await page.getByRole("button", { name: "New rule" }).click();
  await page.getByRole("textbox", { name: "Field path" }).fill("/trace");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(
    results(page).getByText("Equivalent under current rules"),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Enable rule 2" }).uncheck();
  await expect(
    results(page).getByText("1 difference", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit rule 1" }).click();
  await page.getByRole("textbox", { name: "Field path" }).fill("invalid");
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(workspace(page).getByRole("alert")).toContainText(
    "JSON Pointer",
  );
  await page.getByRole("textbox", { name: "Field path" }).fill("/missing");
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(
    results(page).getByText("2 differences", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove rule 1" }).click();
  await expect(
    page.getByRole("list", { name: "Applied rules" }).getByRole("listitem"),
  ).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Enable rule 1" }).check();
  await expect(
    results(page).getByText("1 difference", { exact: true }),
  ).toBeVisible();
});

test(
  "opens and drops SOAP files, selects formats and inspects aligned and structural evidence",
  development,
  async ({ page }) => {
    await openPro(page);
    const before = soapFault("s", "Client", "Invalid order", "test-before");
    const after = soapFault("env", "Server", "Unavailable", "test-after");
    await page.getByLabel("Choose baseline file").setInputFiles({
      name: "sample-before.xml",
      mimeType: "text/xml",
      buffer: Buffer.from(before),
    });
    await expect(baseline(page)).toHaveValue(before);
    const dataTransfer = await page.evaluateHandle((text) => {
      const data = new DataTransfer();
      data.items.add(
        new File([text], "sample-after.xml", { type: "text/xml" }),
      );
      return data;
    }, after);
    await page
      .getByRole("region", { name: "Target", exact: true })
      .dispatchEvent("drop", { dataTransfer });
    await dataTransfer.dispose();
    await expect(target(page)).toHaveValue(after);
    await page.getByLabel("Baseline format").selectOption("soap");
    await compare(page).click();
    await expect(
      page.getByText("Parsed as SOAP", { exact: false }),
    ).toBeVisible();
    await expect(
      results(page).getByText("3 differences", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Rules", exact: true }).click();
    await page.getByText("Comparison settings", { exact: true }).click();
    await page.getByLabel("SOAP scope").selectOption("body");
    await page.getByRole("button", { name: "Apply settings" }).click();
    await expect(
      results(page).getByText("2 differences", { exact: true }),
    ).toBeVisible();
    await view(page, "Side by side").click();
    const aligned = page.getByRole("table", {
      name: "Side-by-side differences",
    });
    await expect(
      aligned.getByRole("row").filter({ hasText: "Client" }),
    ).toContainText("Server");
    await view(page, "Structure").click();
    const targetTree = page.getByRole("region", { name: "Target structure" });
    await expect(
      targetTree.getByRole("button", { name: "<Body>" }),
    ).toHaveAttribute("aria-expanded", "true");
    await targetTree.getByRole("button", { name: "<Fault> [0]" }).click();
    await targetTree.getByRole("button", { name: "<faultcode> [0]" }).click();
    await targetTree
      .getByRole("button", { name: /Inspect .*faultcode/ })
      .click();
    await expect(details(page)).toBeFocused();
    await expect(
      details(page).getByText("env:Server", { exact: true }),
    ).toBeVisible();
  },
);

test(
  "shows the actual target path for an identifier match after reordering",
  development,
  async ({ page }) => {
    await openPro(page);
    await baseline(page).fill(
      '{"items":[{"id":"one","quantity":1},{"id":"two","quantity":5}]}',
    );
    await target(page).fill(
      '{"items":[{"id":"two","quantity":5},{"id":"one","quantity":2}]}',
    );
    await page.getByRole("button", { name: "Rules", exact: true }).click();
    await page.getByText("Comparison settings", { exact: true }).click();
    await page.getByLabel("Array matching").selectOption("keyed");
    await page.getByRole("button", { name: "Apply settings" }).click();
    await compare(page).click();
    await expect(
      results(page).getByText("1 difference", { exact: true }),
    ).toBeVisible();
    await view(page, "Structure").click();
    const tree = page.getByRole("region", { name: "Target structure" });
    await tree.getByRole("button", { name: "items", exact: true }).click();
    await tree.getByRole("button", { name: "[1]", exact: true }).click();
    await tree
      .getByRole("button", { name: "Inspect /items/0/quantity in differences" })
      .click();
    await expect(details(page)).toContainText("/items/1/quantity");
    await expect(
      details(page).getByRole("button", { name: "Copy target path" }),
    ).toBeVisible();
  },
);

test(
  "keeps HTTP metadata visible alongside aligned text bodies",
  development,
  async ({ page }) => {
    await openPro(page);
    await baseline(page).fill(
      "HTTP/1.1 200 OK\nContent-Type: text/plain\n\nStart\nAvailable\nEnd\n",
    );
    await target(page).fill(
      "HTTP/1.1 503 Unavailable\nContent-Type: text/plain\n\nStart\nUnavailable\nEnd\n",
    );
    await compare(page).click();
    await expect(
      results(page).getByText("2 differences", { exact: true }),
    ).toBeVisible();
    await view(page, "Side by side").click();
    const aligned = page.getByRole("table", {
      name: "Side-by-side differences",
    });
    await expect(
      aligned.getByRole("row").filter({ hasText: "/status" }),
    ).toContainText("503");
    await expect(
      aligned.getByRole("row").filter({ hasText: "Available" }),
    ).toContainText("Unavailable");
    await expect(
      page.getByRole("button", { name: "Copy unified body diff" }),
    ).toBeVisible();
  },
);

test(
  "supports explicit application log formats",
  development,
  async ({ page }) => {
    await openPro(page);
    await baseline(page).fill(
      '{"message":"Recorded response","status":200}' +
        "\n" +
        '{"message":"Complete"}',
    );
    await target(page).fill(
      '{"message":"Recorded response","status":503}' +
        "\n" +
        '{"message":"Complete"}',
    );
    for (const side of ["Baseline", "Target"]) {
      await page
        .getByLabel(side + " format", { exact: true })
        .selectOption("log");
      await page.getByLabel(side + " log format").selectOption("ndjson");
    }
    await compare(page).click();
    await expect(
      page.getByText("Parsed as JSON Lines / NDJSON", { exact: true }),
    ).toHaveCount(2);
    await page
      .getByRole("button", { name: "Inspect /0/httpStatus", exact: true })
      .click();
    await expect(details(page).getByText("503", { exact: true })).toBeVisible();
  },
);

test("retains inputs for parsing errors and rejects oversized files before replacing them", async ({
  page,
}) => {
  await page.goto(route);
  await page
    .getByLabel("Baseline example")
    .selectOption({ label: "Order JSON" });
  const original = await baseline(page).inputValue();
  await page.getByLabel("Choose baseline file").setInputFiles({
    name: "too-big.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByText("Use up to 4 MiB of UTF-8 text per side."),
  ).toBeVisible();
  await expect(baseline(page)).toHaveValue(original);
  const acceptedPaste = await baseline(page).evaluate(
    (editor: HTMLTextAreaElement) => {
      editor.setSelectionRange(1, 1);
      const text = new DataTransfer();
      text.setData("text/plain", "é".repeat(2 * 1024 * 1024));
      return editor.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: text,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
  );
  expect(acceptedPaste).toBe(false);
  await expect(
    page.getByText("Use up to 4 MiB of UTF-8 text per side."),
  ).toBeVisible();
  await expect(baseline(page)).toHaveValue(original);
  await page.getByLabel("Choose baseline file").setInputFiles({
    name: "bad-encoding.txt",
    mimeType: "text/plain",
    buffer: Buffer.from([0xc3, 0x28]),
  });
  await expect(page.getByText("Open a valid UTF-8 text file.")).toBeVisible();
  await expect(baseline(page)).toHaveValue(original);
  const bad = '{"broken": ';
  await baseline(page).fill(bad);
  await target(page).fill("{}");
  await compare(page).click();
  await expect(workspace(page).getByRole("alert")).toContainText(
    "Invalid JSON",
  );
  await expect(baseline(page)).toHaveValue(bad);
  await page.getByLabel("Baseline format").selectOption("text");
  await page.getByLabel("Target format").selectOption("text");
  await compare(page).click();
  await expect(
    results(page).getByText("1 difference", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear baseline", exact: true })
    .click();
  await expect(baseline(page)).toHaveValue("");
  await expect(target(page)).toHaveValue("{}");
});

test("cancels a route comparison and starts a fresh worker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    const terminate = Worker.prototype.terminate;
    const scheduled = new WeakMap<Worker, number>();
    let first = true;
    Worker.prototype.postMessage = function (
      message: unknown,
      options?: StructuredSerializeOptions | Transferable[],
    ) {
      if (!first) {
        Reflect.apply(send, this, [message, options]);
        return;
      }
      first = false;
      scheduled.set(
        this,
        window.setTimeout(
          () => Reflect.apply(send, this, [message, options]),
          4_000,
        ),
      );
    };
    Worker.prototype.terminate = function () {
      clearTimeout(scheduled.get(this));
      terminate.call(this);
    };
  });
  await page.goto(route);
  await page.getByRole("button", { name: "Load sample pair" }).click();
  await compare(page).click();
  await expect(page.getByText("Comparing locally…")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText("Operation cancelled. You can compare again."),
  ).toBeVisible();
  await expect(results(page)).toHaveCount(0);
  await compare(page).click();
  await expect(
    results(page).getByText("3 differences", { exact: true }),
  ).toBeVisible();
});

test("keeps synthetic data local on the real route and clears input and undo history", async ({
  page,
  context,
  baseURL,
}) => {
  const marker = "private-compare-marker-e4cda6";
  const requests: Promise<string>[] = [];
  const external: string[] = [];
  const sockets: string[] = [];
  const consoleMessages: string[] = [];
  context.on("request", (request) => {
    if (new URL(request.url()).origin !== baseURL) external.push(request.url());
    requests.push(
      request
        .allHeaders()
        .catch(() => request.headers())
        .then(
          (headers) =>
            request.url() +
            JSON.stringify(headers) +
            (request.postData() ?? ""),
        ),
    );
  });
  page.on("websocket", (socket) => {
    sockets.push(socket.url());
    socket.on("framesent", ({ payload }) => sockets.push(String(payload)));
  });
  page.on("console", (event) => consoleMessages.push(event.text()));
  await page.goto(route);
  const script = '<img src="https://example.invalid/' + marker + '"/>';
  await baseline(page).fill(JSON.stringify({ payload: script }));
  await target(page).fill(JSON.stringify({ payload: marker }));
  await page.getByLabel("Target label").fill(marker);
  await compare(page).click();
  await page.getByRole("button", { name: "Inspect /payload" }).click();
  await expect(details(page).getByText(script, { exact: true })).toBeVisible();
  await expect(page.locator("img[src*='" + marker + "']")).toHaveCount(0);
  await view(page, "Side by side").click();
  await baseline(page).fill(
    syntheticExternalEntity.replace("compare-private-fixture", marker),
  );
  await target(page).fill("<test/>");
  await compare(page).click();
  await expect(workspace(page).getByRole("alert")).toContainText("DOCTYPE");
  await page.getByRole("button", { name: "Clear workspace" }).click();
  await expect(baseline(page)).toHaveValue("");
  await expect(target(page)).toHaveValue("");
  await expect(page.getByLabel("Target label")).toHaveValue("");
  await baseline(page).focus();
  await baseline(page).press(
    process.platform === "darwin" ? "Meta+z" : "Control+z",
  );
  await expect(baseline(page)).toHaveValue("");
  await page.reload();
  await expect(baseline(page)).toHaveValue("");
  await expect(results(page)).toHaveCount(0);
  const storage = await page.evaluate(async () => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    databaseNames: (await indexedDB.databases()).map((entry) => entry.name),
  }));
  expect(storage).toEqual({
    local: { "stack-workbench-compare-view": "paired" },
    session: {},
    databaseNames: [],
  });
  expect(external).toEqual([]);
  expect((await Promise.all(requests)).join("\n")).not.toContain(marker);
  expect(sockets.join("\n")).not.toContain(marker);
  expect(consoleMessages.join("\n")).not.toContain(marker);
});

test("uses aligned line context and remains within the viewport on mobile in both themes", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(route);
  await page
    .getByLabel("Baseline example")
    .selectOption({ label: "Plain-text response" });
  await page
    .getByLabel("Target example")
    .selectOption({ label: "Plain-text response" });
  await compare(page).click();
  await expect(
    results(page).getByText("2 differences", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect /2" }).click();
  await expect(details(page)).toBeFocused();
  await details(page)
    .getByRole("button", { name: "Close difference details" })
    .click();
  await expect(page.getByRole("button", { name: "Inspect /2" })).toBeFocused();
  await view(page, "Side by side").click();
  const aligned = page.getByRole("table", { name: "Side-by-side differences" });
  await expect(
    aligned.getByRole("row").filter({ hasText: "Inventory reserved" }),
  ).toContainText("Inventory pending");
  await expect(
    aligned.getByRole("row").filter({ hasText: "Order validation" }),
  ).toContainText("Unchanged");
  await page.getByRole("button", { name: "Copy unified diff" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("+Inventory pending");
  const toggle = page.getByRole("button", { name: "Dark theme" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
