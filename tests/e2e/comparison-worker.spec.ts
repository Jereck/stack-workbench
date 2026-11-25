import { expect, test } from "@playwright/test";
import { serveComparisonFixture } from "../fixtures/comparison-server";
import { syntheticExternalEntity } from "../fixtures/integration-compare";

let fixture: Awaited<ReturnType<typeof serveComparisonFixture>>;

test.beforeAll(async () => {
  fixture = await serveComparisonFixture();
});
test.afterAll(async () => {
  await fixture?.close();
});

test("compares in a browser worker without exposing synthetic input in traffic or storage", async ({
  page,
  context,
}) => {
  const marker = "synthetic-comparison-content-946bf";
  const traffic: { url: string; headerAndBody: string }[] = [];
  const consoleMessages: string[] = [];
  const sockets: string[] = [];
  context.on("request", (request) => {
    traffic.push({
      url: request.url(),
      headerAndBody:
        JSON.stringify(request.headers()) + (request.postData() ?? ""),
    });
  });
  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("websocket", (socket) => sockets.push(socket.url()));
  await page.goto(fixture.url);
  await page.waitForFunction(
    () => typeof window.startComparison === "function",
  );
  const outcome = await page.evaluate(
    async ({ marker, syntheticExternalEntity }) => {
      const input = (status: number) => ({
        text: JSON.stringify({
          "@t": "2026-01-01T12:00:00Z",
          "@mt": marker,
          url: "https://example.invalid/" + marker,
          status,
        }),
        format: "log" as const,
      });
      const compare = (status: number) =>
        window.startComparison({ baseline: input(200), target: input(status) })
          .result;
      const logs = await compare(503);
      const xml = await window.startComparison({
        baseline: {
          text: syntheticExternalEntity.replace(
            "compare-private-fixture",
            marker,
          ),
        },
        target: { text: "<test/>" },
      }).result;
      return {
        logs,
        xml,
        storage: [
          ...Object.keys(localStorage),
          ...Object.keys(sessionStorage),
          ...(await indexedDB.databases()).map((entry) => entry.name),
        ],
      };
    },
    { marker, syntheticExternalEntity },
  );
  expect(outcome.logs).toMatchObject({
    status: "completed",
    result: {
      status: "compared",
      differences: expect.arrayContaining([
        expect.objectContaining({
          path: [0, "httpStatus"],
          baseline: 200,
          target: 503,
          classification: "modified",
        }),
      ]),
    },
  });
  expect(outcome.xml).toMatchObject({
    status: "completed",
    result: {
      status: "failed",
      errors: [
        { side: "baseline", message: expect.stringContaining("DOCTYPE") },
      ],
    },
  });
  expect(outcome.storage).toEqual([]);
  expect(sockets).toEqual([]);
  expect(
    traffic.some(({ url }) =>
      /^\/assets\/worker-.*\.js$/.test(new URL(url).pathname),
    ),
  ).toBe(true);
  expect(
    traffic.every(
      ({ url }) => new URL(url).origin === new URL(fixture.url).origin,
    ),
  ).toBe(true);
  expect(JSON.stringify(traffic)).not.toContain(marker);
  expect(JSON.stringify(consoleMessages)).not.toContain(marker);
});

test("terminates a cancelled worker and accepts a fresh job", async ({
  page,
}) => {
  await page.goto(fixture.url);
  await page.waitForFunction(
    () => typeof window.startComparison === "function",
  );
  const response = await page.evaluate(async () => {
    let terminations = 0;
    const terminate = Worker.prototype.terminate;
    Worker.prototype.terminate = function () {
      terminations++;
      terminate.call(this);
    };
    try {
      const expensive = JSON.stringify(
        Array.from({ length: 25_000 }, (_, index) => ({ id: index })),
      );
      const job = window.startComparison({
        baseline: { text: expensive },
        target: { text: expensive },
      });
      job.cancel();
      const cancelled = await job.result;
      job.cancel();
      const restarted = await window.startComparison({
        baseline: { text: '{"name":"one"}' },
        target: { text: '{"name":"two"}' },
      }).result;
      return { cancelled, restarted, terminations };
    } finally {
      Worker.prototype.terminate = terminate;
    }
  });
  expect(response.cancelled).toEqual({ status: "cancelled" });
  expect(response.terminations).toBe(2);
  expect(response.restarted).toMatchObject({
    status: "completed",
    result: { status: "compared", statistics: { totalDifferences: 1 } },
  });
});
