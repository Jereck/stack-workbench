import { cpus, platform, release } from "node:os";
import { chromium } from "@playwright/test";
import { serveComparisonFixture } from "../fixtures/comparison-server.ts";
import { httpJsonResponse } from "../fixtures/integration-compare.ts";

const runs = 5;
const json = (value) => ({ text: JSON.stringify(value), format: "json" });
const xml = (text) => ({ text, format: "soap" });
const logs = (text) => ({ text, format: "log" });

function nested(change) {
  return json({
    integrations: Array.from({ length: 6000 }, (_, index) => ({
      received: {
        source: "synthetic-inventory",
        items: [{ id: index, quantity: index % 100 === 0 ? change : 50 }],
      },
    })),
  });
}

function records(change, reverse = false) {
  const list = Array.from({ length: 15_000 }, (_, index) => ({
    id: "synthetic-" + index,
    active: true,
    location: "demo-warehouse",
    quantity: index % 250 === 0 ? change : 10,
  }));
  return json(reverse ? list.reverse() : list);
}

function envelope(change) {
  const items = Array.from(
    { length: 4500 },
    (_, index) =>
      '<ord:item id="' +
      index +
      '"><ord:quantity>' +
      (index % 125 === 0 ? change : 20) +
      "</ord:quantity></ord:item>",
  );
  return xml(
    '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:ord="urn:demo"><s:Body><ord:products>' +
      items.join("") +
      "</ord:products></s:Body></s:Envelope>",
  );
}

function session(change) {
  return logs(
    Array.from({ length: 4000 }, (_, index) =>
      JSON.stringify({
        "@t": "2026-01-01T00:00:00Z",
        "@mt": "Processing synthetic inventory",
        status: index % 100 === 0 ? change : 200,
        service: "demo-inventory",
        traceId: "sample-" + index,
      }),
    ).join("\n"),
  );
}

function transactions() {
  return Array.from({ length: 24 }, (_, index) => ({
    baseline: {
      text: httpJsonResponse(
        200,
        JSON.stringify({ index, products: [1, 2, 3] }),
      ),
    },
    target: {
      text: httpJsonResponse(503, JSON.stringify({ index, products: [1, 2] })),
    },
  }));
}

const workloads = [
  {
    name: "Small JSON",
    requests: [
      {
        baseline: json({ id: "demo", rows: [1, false, null] }),
        target: json({ id: "demo", rows: [1, true, null] }),
      },
    ],
    expected: 1,
  },
  {
    name: "Nested JSON (6,000 items)",
    requests: [{ baseline: nested(100), target: nested(200) }],
    expected: 60,
  },
  {
    name: "Keyed JSON (15,000 records)",
    requests: [
      {
        baseline: records(3),
        target: records(7, true),
        configuration: { arrays: { kind: "keyed", keys: ["id"] } },
      },
    ],
    expected: 60,
  },
  {
    name: "SOAP (4,500 items)",
    requests: [{ baseline: envelope(100), target: envelope(200) }],
    expected: 36,
  },
  {
    name: "Normalized logs (4,000 events)",
    requests: [{ baseline: session(200), target: session(503) }],
    expected: 80,
  },
  {
    name: "Raw HTTP (24 independent pairs)",
    requests: transactions(),
    expected: 48,
  },
];

function range(samples) {
  const ordered = [...samples].sort((a, b) => a - b);
  const round = (value) => Math.round(value * 10) / 10;
  return {
    median: round(ordered[Math.floor(ordered.length / 2)]),
    min: round(ordered[0]),
    max: round(ordered.at(-1)),
  };
}

const server = await serveComparisonFixture();
try {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(server.url);
    await page.waitForFunction(
      () => typeof window.startComparison === "function",
    );
    const measurements = [];
    for (const { name, requests, expected } of workloads) {
      const results = [];
      for (let iteration = 0; iteration <= runs; iteration++) {
        const result = await page.evaluate(async (requests) => {
          let workerMs = 0;
          let differences = 0;
          const start = performance.now();
          for (const request of requests) {
            const outcome = await window.startComparison(request).result;
            if (
              outcome.status !== "completed" ||
              outcome.result.status !== "compared"
            )
              throw new Error("Synthetic benchmark job failed.");
            workerMs += outcome.durationMs;
            differences += outcome.result.statistics.totalDifferences;
          }
          return { workerMs, elapsed: performance.now() - start, differences };
        }, requests);
        if (result.differences !== expected)
          throw new Error(
            "Unexpected difference count for " +
              name +
              ": " +
              result.differences,
          );
        if (iteration) results.push(result);
      }
      measurements.push({
        name,
        pairs: requests.length,
        baselineBytes: requests.reduce(
          (size, request) => size + Buffer.byteLength(request.baseline.text),
          0,
        ),
        targetBytes: requests.reduce(
          (size, request) => size + Buffer.byteLength(request.target.text),
          0,
        ),
        workerMs: range(results.map((sample) => sample.workerMs)),
        elapsedMs: range(results.map((sample) => sample.elapsed)),
      });
    }
    const cancellation = await page.evaluate(async (request) => {
      const job = window.startComparison(request);
      await new Promise((done) => setTimeout(done, 0));
      const start = performance.now();
      job.cancel();
      const outcome = await job.result;
      return {
        status: outcome.status,
        cancelToSettlementMs: performance.now() - start,
      };
    }, workloads[2].requests[0]);
    if (cancellation.status !== "cancelled")
      throw new Error("Synthetic cancellation did not finish as expected.");
    console.log(
      JSON.stringify(
        {
          node: process.version,
          chromium: browser.version(),
          platform: platform() + " " + release(),
          cpu: cpus()[0]?.model,
          runs,
          measurements,
          cancellation,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
