import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import {
  development,
  openPro,
  selectPro,
} from "../fixtures/comparison-development";
import { logLines, transaction } from "../fixtures/comparison-session";

const switchTo = (page: Page, name: string) =>
  page
    .getByRole("group", { name: "Comparison workflow" })
    .getByRole("button", { name, exact: true })
    .click();
const sessions = (page: Page) =>
  page.getByRole("region", { name: "Log session workspace" });
const results = (page: Page) =>
  page.getByRole("region", { name: "Session comparison results" });
const profiles = (page: Page) =>
  page.getByRole("region", { name: "Saved comparison profiles" });
const batch = (page: Page) =>
  page.getByRole("region", { name: "Batch comparison workspace" });
const profileFile = (page: Page, profile: unknown) =>
  page.getByLabel("Choose profile file").setInputFiles({
    name: "comparison-profile.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(profile)),
  });

async function report(
  page: Page,
  within: Locator,
  format: string,
  values = false,
) {
  await within.getByText("Regression report", { exact: true }).click();
  await within.getByLabel("Report format").selectOption(format);
  if (values)
    await within
      .getByRole("checkbox", { name: "Include captured values" })
      .check();
  const expected = page.waitForEvent("download");
  await within
    .getByRole("button", { name: "Download report", exact: true })
    .click();
  const saved = await expected;
  return {
    name: saved.suggestedFilename(),
    text: await readFile(await saved.path(), "utf8"),
  };
}

test(
  "compares full recorded sessions, drills into evidence, and matches different correlation IDs",
  development,
  async ({ page }) => {
    await openPro(page);
    await switchTo(page, "Log sessions");
    const scope = sessions(page);
    await scope.getByRole("button", { name: "Load session examples" }).click();
    await scope.getByRole("button", { name: "Compare sessions" }).click();
    await expect(results(page).getByRole("status")).toContainText(
      "1 matched transaction",
    );
    await expect(
      results(page).getByRole("region", { name: "DEV session summary" }),
    ).toContainText("Events3");
    const status = results(page)
      .getByRole("listitem")
      .filter({ hasText: "HTTP response changed from 200 to 502." });
    await status.getByRole("button", { name: /^Evidence #/ }).click();
    const evidence = results(page).getByRole("region", {
      name: "Selected session evidence",
    });
    await expect(evidence).toContainText(
      "HTTP response changed from 200 to 502.",
    );
    await evidence
      .getByRole("button", { name: "Event #2", exact: true })
      .first()
      .click();
    const event = results(page).getByRole("region", {
      name: "Selected log event",
    });
    await expect(event).toContainText("Reserve response");
    await event.getByText("Source record", { exact: true }).click();
    await expect(event.getByLabel("Original log record")).toContainText(
      "request-dev",
    );

    await scope.getByText("Match correlation groups", { exact: true }).click();
    await scope
      .getByLabel("Baseline correlation group")
      .selectOption({ label: "traceId · demo-dev (3 events)" });
    await scope
      .getByLabel("Target correlation group")
      .selectOption({ label: "traceId · demo-qa (3 events)" });
    await scope
      .getByRole("button", { name: "Compare selected groups" })
      .click();
    await expect(results(page).getByRole("status")).toContainText(
      "1 matched transaction",
    );
    const downloaded = await report(page, scope, "json");
    expect(downloaded.name).toBe("integration-compare-report.json");
    const data = JSON.parse(downloaded.text);
    expect(data.labels).toEqual({ baseline: "DEV", target: "QA" });
    expect(data.session.groupFields).toEqual({
      baseline: "traceId",
      target: "traceId",
    });
    expect(data.observations).toContainEqual(
      expect.objectContaining({
        message: "HTTP response changed from 200 to 502.",
      }),
    );
    expect(downloaded.text).not.toContain("request-dev");
  },
);

test(
  "shows ambiguous repeated transactions and applies a one-to-one manual match",
  development,
  async ({ page }) => {
    await openPro(page);
    await switchTo(page, "Log sessions");
    const scope = sessions(page);
    await scope
      .getByRole("textbox", { name: "Baseline logs input" })
      .fill(
        logLines(
          ...transaction({ environment: "dev", order: "one" }),
          ...transaction({ environment: "dev", order: "two" }),
        ),
      );
    await scope
      .getByRole("textbox", { name: "Target logs input" })
      .fill(
        logLines(
          ...transaction({ environment: "qa", order: "two", status: 502 }),
          ...transaction({ environment: "qa", order: "one", response: false }),
        ),
      );
    await scope.getByRole("button", { name: "Compare sessions" }).click();
    await expect(results(page).getByRole("status")).toContainText(
      "0 matched transactions",
    );
    await results(page)
      .getByRole("button", { name: "HTTP transactions" })
      .click();
    await expect(
      results(page).getByRole("table", {
        name: "Matched and unmatched transactions",
      }),
    ).toContainText("ambiguous");
    await scope
      .getByText("Manual transaction matching", { exact: true })
      .click();
    await scope
      .getByRole("spinbutton", { name: "Baseline transaction number" })
      .fill("1");
    await scope
      .getByRole("spinbutton", { name: "Target transaction number" })
      .fill("3");
    await scope.getByRole("button", { name: "Apply manual match" }).click();
    await expect(results(page).getByRole("status")).toContainText(
      "2 matched transactions",
    );
    await expect(
      results(page).getByRole("listitem").filter({
        hasText: "A response record was observed only in the baseline logs",
      }),
    ).toBeVisible();
    await results(page)
      .getByRole("button", { name: "HTTP transactions" })
      .click();
    await expect(
      results(page).getByRole("table", {
        name: "Matched and unmatched transactions",
      }),
    ).toContainText("Manual match");
    await scope
      .getByText("Manual transaction matching (1)", { exact: true })
      .click();
    await scope.getByRole("button", { name: "Remove manual match" }).click();
    await expect(results(page).getByRole("status")).toContainText(
      "0 matched transactions",
    );
  },
);

test(
  "runs a batch with a shared profile and inspects changed and failed pairs",
  development,
  async ({ page }) => {
    await openPro(page);
    await switchTo(page, "Profiles");
    await profileFile(page, {
      version: 1,
      name: "Ignore synthetic stamp",
      baselineFormat: "json",
      targetFormat: "json",
      configuration: {
        rules: [
          { id: "stamp", kind: "ignore-path", path: "/stamp", enabled: true },
        ],
      },
    });
    await expect(profiles(page).getByText("Profile imported.")).toBeVisible();
    await switchTo(page, "Batch");
    const scope = batch(page);
    await scope
      .getByLabel("Batch profile")
      .selectOption({ label: "Ignore synthetic stamp" });
    async function fill(label: string, baseline: string, target: string) {
      await scope.getByRole("textbox", { name: "Pair label" }).fill(label);
      await scope
        .getByRole("textbox", { name: "Pair baseline input" })
        .fill(baseline);
      await scope
        .getByRole("textbox", { name: "Pair target input" })
        .fill(target);
    }
    await fill("Stamp only", '{"stamp":"left"}', '{"stamp":"right"}');
    await scope.getByRole("button", { name: "Add pair" }).click();
    await fill("Changed inventory", '{"quantity":4}', '{"quantity":3}');
    await scope.getByRole("button", { name: "Add pair" }).click();
    await fill("Malformed payload", '{"invalid":', "{}");
    await scope.getByRole("button", { name: "Run all pairs" }).click();
    await expect(
      scope.getByText("3 / 3 completed · 1 changed · 1 failed"),
    ).toBeVisible();
    await expect(
      scope.getByRole("row").filter({ hasText: "Stamp only" }),
    ).toContainText("equivalent");
    await expect(
      scope.getByRole("row").filter({ hasText: "Malformed payload" }),
    ).toContainText("Invalid JSON");
    await scope
      .getByRole("button", { name: "Inspect Changed inventory" })
      .click();
    const inspected = scope.getByRole("region", { name: "Comparison results" });
    await expect(
      inspected.getByRole("button", { name: "Inspect /quantity" }),
    ).toBeVisible();
    const downloaded = await report(page, inspected, "csv", true);
    expect(downloaded.text).toContain("/quantity");
    expect(downloaded.text).toContain("Changed inventory baseline");
  },
);

test(
  "creates, edits, duplicates, imports, exports, and clears local profiles",
  development,
  async ({ page }) => {
    await openPro(page);
    const workspace = page.getByRole("region", {
      name: "Integration Compare workspace",
    });
    await workspace
      .getByRole("textbox", { name: "Baseline input" })
      .fill('{"raw":"workspace-private-value"}');
    await workspace
      .getByLabel("Baseline format", { exact: true })
      .selectOption("json");
    await switchTo(page, "Profiles");
    const scope = profiles(page);
    await scope.getByRole("button", { name: "New profile" }).click();
    await scope
      .getByRole("textbox", { name: "Profile name" })
      .fill("QA comparison");
    await scope
      .getByRole("textbox", { name: "Description" })
      .fill("Synthetic rules only");
    await scope.getByRole("button", { name: "Save profile" }).click();
    await expect(scope.getByText("Profile saved locally.")).toBeVisible();
    await scope.getByRole("button", { name: "Duplicate", exact: true }).click();
    await scope.getByRole("button", { name: "Edit profile" }).click();
    await scope
      .getByRole("textbox", { name: "Profile name" })
      .fill("Renamed copy");
    await scope.getByRole("button", { name: "Save profile" }).click();
    const expected = page.waitForEvent("download");
    await scope.getByRole("button", { name: "Export profile" }).click();
    const exported = await expected;
    const content = await readFile(await exported.path(), "utf8");
    expect(JSON.parse(content)).toMatchObject({
      version: 1,
      name: "Renamed copy",
      baselineFormat: "json",
    });
    expect(content).not.toContain("workspace-private-value");
    await page.reload();
    await expect(
      workspace.getByRole("textbox", { name: "Baseline input" }),
    ).toHaveValue("");
    await selectPro(page);
    await switchTo(page, "Profiles");
    await scope
      .getByLabel("Saved profile")
      .selectOption({ label: "Renamed copy" });
    await scope.getByRole("button", { name: "Delete profile" }).click();
    await expect(
      scope
        .getByLabel("Saved profile")
        .getByRole("option", { name: "Renamed copy" }),
    ).toHaveCount(0);
    await profileFile(page, {
      ...JSON.parse(content),
      raw: "unexpected-input",
    });
    await expect(scope.getByRole("alert")).toContainText(
      "Invalid comparison profile",
    );
    await profileFile(page, JSON.parse(content));
    await expect(scope.getByText("Profile imported.")).toBeVisible();
    await scope.getByRole("button", { name: "Apply to payloads" }).click();
    await expect(
      workspace.getByLabel("Baseline format", { exact: true }),
    ).toHaveValue("json");
    await switchTo(page, "Profiles");
    await scope.getByRole("button", { name: "Clear stored profiles" }).click();
    await scope.getByRole("button", { name: "Remove all profiles" }).click();
    await expect(scope.getByText("No saved profiles")).toBeVisible();
  },
);

test(
  "cancels the active batch worker and retains finished summaries",
  development,
  async ({ page }) => {
    await page.addInitScript(() => {
      const send = Worker.prototype.postMessage;
      const terminate = Worker.prototype.terminate;
      const pending = new WeakMap<Worker, number>();
      let jobs = 0;
      Worker.prototype.postMessage = function (
        message: unknown,
        options?: StructuredSerializeOptions | Transferable[],
      ) {
        const isBatch =
          typeof message === "object" &&
          message !== null &&
          "kind" in message &&
          message.kind === "batch";
        if (isBatch && ++jobs === 2)
          pending.set(
            this,
            window.setTimeout(
              () => Reflect.apply(send, this, [message, options]),
              5_000,
            ),
          );
        else Reflect.apply(send, this, [message, options]);
      };
      Worker.prototype.terminate = function () {
        clearTimeout(pending.get(this));
        terminate.call(this);
      };
    });
    await openPro(page);
    await switchTo(page, "Batch");
    const scope = batch(page);
    await scope.getByRole("button", { name: "Load batch examples" }).click();
    await scope.getByRole("button", { name: "Run all pairs" }).click();
    await expect(scope.getByText(/^1 \/ 2 completed/)).toBeVisible();
    await scope.getByRole("button", { name: "Cancel batch" }).click();
    await expect(
      scope.getByText(
        "Batch operation cancelled. Completed pairs remain available.",
      ),
    ).toBeVisible();
    await expect(
      scope.getByRole("button", { name: "Inspect Order JSON" }),
    ).toBeEnabled();
    await expect(
      scope.getByRole("row").filter({ hasText: "HTTP response" }),
    ).toContainText("Pending");
  },
);

test(
  "exports a redacted report without leaking synthetic values to storage or traffic",
  development,
  async ({ page, context, baseURL }) => {
    const marker = "synthetic-report-canary-6c09ce";
    const traffic: string[] = [];
    const external: string[] = [];
    context.on("request", (request) => {
      traffic.push(
        request.url() +
          JSON.stringify(request.headers()) +
          (request.postData() ?? ""),
      );
      const origin = new URL(request.url()).origin;
      if (origin !== baseURL && !request.url().startsWith("blob:"))
        external.push(request.url());
    });
    await openPro(page);
    const scope = page.getByRole("region", {
      name: "Integration Compare workspace",
    });
    await scope
      .getByRole("textbox", { name: "Baseline input" })
      .fill('{"nested":{"apiKey":"original-fixture"}}');
    await scope
      .getByRole("textbox", { name: "Target input" })
      .fill(JSON.stringify({ nested: { apiKey: marker } }));
    await scope.getByRole("button", { name: "Compare", exact: true }).click();
    await expect(
      scope.getByText("1 difference", { exact: true }),
    ).toBeVisible();
    const downloaded = await report(page, scope, "html", true);
    expect(downloaded.name).toBe("integration-compare-report.html");
    expect(downloaded.text).toContain("Best-effort masking");
    expect(downloaded.text).toContain("[REDACTED]");
    expect(downloaded.text).not.toContain(marker);
    expect(external).toEqual([]);
    expect(traffic.join("\n")).not.toContain(marker);
    expect(
      await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      })),
    ).toEqual({ local: {}, session: {} });
  },
);
