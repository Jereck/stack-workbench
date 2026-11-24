import { cpus, platform, release } from "node:os";
import { chromium } from "@playwright/test";

const url = new URL(
  "/tools/log-inspector",
  process.argv[2] ?? "http://127.0.0.1:3100",
).href;
const runs = 5;
const seedTime = Date.UTC(2026, 5, 17, 13);

function fixture(name, limit, record) {
  let bytes = 0;
  const lines = [];
  for (let i = 0; bytes < limit; i++) {
    const entry = record(i, new Date(seedTime + i * 10).toISOString()) + "\n";
    const length = Buffer.byteLength(entry);
    if (bytes + length > limit) break;
    lines.push(entry);
    bytes += length;
  }
  return {
    name,
    bytes,
    count: lines.length,
    buffer: Buffer.from(lines.join("")),
  };
}

const fixtures = [
  fixture("Serilog compact JSON", 256 * 1024, (index, timestamp) =>
    JSON.stringify({
      "@t": timestamp,
      "@mt": "Retrying fulfillment for {Order}",
      "@l": index % 8 === 0 ? "Warning" : "Information",
      "@tr": "trace-" + Math.floor(index / 3),
      Order: "demo-" + index,
      SourceContext: "Demo.Fulfillment",
    }),
  ),
  fixture(
    "Serilog text with stack traces",
    1024 * 1024,
    (index, timestamp) =>
      timestamp +
      (index % 8 === 0
        ? " [ERR] POST /payments responded 503 requestId=demo-" +
          index +
          "\nDemo.PartnerException: Synthetic outage\n   at Demo.Partner.Send()\nCaused by: TimeoutException: Synthetic timeout\n   at Demo.Transport.Read()"
        : " [INF] GET /orders/demonstration HTTP status requestId=demo-" +
          index),
  ),
  fixture(
    "API integration NDJSON with nested bodies",
    Math.floor(3.9 * 1024 * 1024),
    (index, timestamp) =>
      JSON.stringify({
        timestamp,
        level: index % 8 === 0 ? "error" : "info",
        message: "POST /orders responded " + (index % 8 === 0 ? "503" : "200"),
        requestId: "demo-" + index,
        service: "orders-demo",
        requestBody: JSON.stringify({ id: "test-" + index, quantity: 2 }),
        responseBody: JSON.stringify(
          JSON.stringify({ status: "synthetic", warehouse: "demo-north" }),
        ),
      }),
  ),
];

function range(samples) {
  const times = [...samples].sort((first, second) => first - second);
  return {
    median: times[Math.floor(times.length / 2)],
    min: times[0],
    max: times.at(-1),
  };
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ locale: "en-US" });
  const measurements = [];
  for (const { name, bytes, count, buffer } of fixtures) {
    const samples = [];
    for (let iteration = 0; iteration <= runs; iteration++) {
      await page.goto(url);
      const file = page.getByLabel("Choose log file");
      await page.getByRole("button", { name: "Open local file" }).waitFor();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (button) =>
            button.textContent === "Open local file" && !button.disabled,
        ),
      );
      await file.setInputFiles({
        name: "synthetic.log",
        mimeType: "text/plain",
        buffer,
      });
      await page
        .getByText("Local file loaded. Parse logs to inspect it.")
        .waitFor();
      const parsed = await page
        .getByRole("button", { name: "Parse logs" })
        .evaluate(
          (button) =>
            new Promise((resolve, reject) => {
              const workspace = button.closest("#log-workbench");
              const start = performance.now();
              const observer = new MutationObserver(() => {
                const status = button
                  .closest("section")
                  .querySelector('[role="status"]').textContent;
                const match = /^Parsed ([\d,]+) events? in ([\d.]+) ms\.$/.exec(
                  status,
                );
                const rows = workspace.querySelectorAll(
                  '[aria-label="Log events"] > li',
                ).length;
                if (!match || !rows) return;
                observer.disconnect();
                clearTimeout(timeout);
                resolve({
                  count: Number(match[1].replaceAll(",", "")),
                  worker: Number(match[2]),
                  visible: Math.round((performance.now() - start) * 10) / 10,
                  rows,
                });
              });
              const timeout = setTimeout(() => {
                observer.disconnect();
                reject(new Error("Results did not render."));
              }, 30_000);
              observer.observe(workspace, {
                childList: true,
                characterData: true,
                subtree: true,
              });
              button.click();
            }),
        );
      if (parsed.count !== count || parsed.rows > 50)
        throw new Error("Unexpected result or page size for " + name);
      if (iteration > 0) samples.push(parsed);
    }
    measurements.push({
      name,
      bytes,
      count,
      worker_ms: range(samples.map((sample) => sample.worker)),
      click_to_rows_ms: range(samples.map((sample) => sample.visible)),
    });
  }
  console.log(
    JSON.stringify(
      {
        chromium: browser.version(),
        platform: platform() + " " + release(),
        cpu: cpus()[0]?.model,
        node: process.version,
        runs,
        measurements,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
