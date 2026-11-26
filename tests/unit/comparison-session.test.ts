import { describe, expect, it } from "vitest";
import { compareSessions } from "../../packages/comparison-engine/src";
import type { SessionOptions } from "../../packages/comparison-engine/src";
import { logLines, transaction } from "../fixtures/comparison-session";

function compared(baseline: string, target: string, options?: SessionOptions) {
  const result = compareSessions({
    baseline: { text: baseline },
    target: { text: target },
    options,
  });
  if (result.status !== "compared") throw new Error(result.message);
  return result;
}

describe("recorded session comparison", () => {
  it("pairs captured HTTP records across environments and observes changes with evidence", () => {
    const baseline = logLines(...transaction({ environment: "dev" }), {
      operation: "Finalize",
      service: "orders",
      level: "error",
      message: "Degraded",
      exception: { type: "IntegrationError", message: "Retry requested" },
    });
    const target = logLines(
      {
        operation: "Finalize",
        service: "orders",
        level: "error",
        message: "Degraded",
        exception: { type: "IntegrationError", message: "Retries exhausted" },
      },
      ...transaction({ environment: "qa", status: 502, durationMs: 4821 }),
      {
        operation: "Escalate",
        service: "alerts",
        level: "error",
        message: "Synthetic escalation",
      },
    );
    const result = compared(baseline, target);
    expect(result.baseline.events).toHaveLength(3);
    expect(result.target.events).toHaveLength(4);
    expect(result.baseline.groups).toContainEqual(
      expect.objectContaining({
        field: "traceId",
        value: "trace-dev",
        count: 2,
      }),
    );
    expect(result.target.groups).toContainEqual(
      expect.objectContaining({
        field: "traceId",
        value: "trace-qa",
        count: 2,
      }),
    );
    expect(result.baseline.transactions[0]).toMatchObject({
      events: [0, 1],
      requestEvent: 0,
      responseEvent: 1,
      endpoint: "/api/reserve",
    });
    expect(result.transactionMatches).toEqual([
      { baseline: 0, target: 1, reason: "Method and normalized endpoint" },
    ]);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "status",
          description: "HTTP response changed from 200 to 502.",
          baselineEvents: [0, 1],
          targetEvents: [1, 2],
        }),
        expect.objectContaining({
          kind: "duration",
          description: "Recorded duration changed from 342 ms to 4821 ms.",
        }),
        expect.objectContaining({
          kind: "response",
          difference: expect.objectContaining({
            path: ["details", "quantity"],
            classification: "type-changed",
          }),
        }),
        expect.objectContaining({ kind: "ordering" }),
        expect.objectContaining({
          kind: "exception",
          baselineEvents: [2],
          targetEvents: [0],
        }),
        expect.objectContaining({ kind: "services" }),
      ]),
    );
    const finding = result.findings.find((entry) => entry.kind === "status")!;
    expect(result.observations).toContainEqual({
      message: finding.description,
      evidence: [finding.id],
    });
  });

  it("reports a response recorded only on one side without fabricating a status or duration", () => {
    const result = compared(
      logLines(...transaction({ environment: "dev" })),
      logLines(...transaction({ environment: "qa", response: false })),
    );
    expect(result.transactionMatches).toHaveLength(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        kind: "operation",
        description:
          "A response record was observed only in the baseline logs for this match.",
      }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        kind: "status",
        difference: expect.objectContaining({
          baseline: 200,
          target: undefined,
        }),
      }),
    );
    expect(result.findings.some(({ kind }) => kind === "duration")).toBe(false);
  });

  it("exposes repeated requests and supports payload identifiers, groups, and manual overrides", () => {
    const before = logLines(
      ...transaction({ environment: "dev", order: "first" }),
      ...transaction({ environment: "dev", order: "second" }),
    );
    const after = logLines(
      ...transaction({ environment: "qa", order: "second" }),
      ...transaction({ environment: "qa", order: "first" }),
    );
    const ambiguous = compared(before, after);
    expect(ambiguous.transactionMatches).toHaveLength(0);
    expect(ambiguous.issues).toContainEqual(
      expect.objectContaining({
        scope: "transactions",
        kind: "ambiguous",
        baseline: [0, 2],
        target: [0, 2],
      }),
    );
    const configured = compared(before, after, {
      groups: {
        baseline: { field: "traceId", value: "trace-dev" },
        target: { field: "traceId", value: "trace-qa" },
      },
      matching: { payloadIdentifiers: ["/order"] },
    });
    expect(
      configured.transactionMatches.map(({ baseline, target }) => [
        baseline,
        target,
      ]),
    ).toEqual([
      [0, 2],
      [2, 0],
    ]);
    const manual = compared(before, after, {
      overrides: [
        { baseline: 0, target: 2 },
        { baseline: 2, target: 2 },
      ],
    });
    expect(manual.transactionMatches[0]).toEqual({
      baseline: 0,
      target: 2,
      reason: "Manual match",
    });
    expect(manual.issues).toContainEqual(
      expect.objectContaining({ kind: "override" }),
    );
    const rematched = compared(before, after, {
      matching: { payloadIdentifiers: ["/order"] },
      overrides: [{ baseline: 0, target: 0 }],
    });
    expect(
      rematched.transactionMatches.map(({ baseline, target }) => [
        baseline,
        target,
      ]),
    ).toEqual([[0, 0]]);
  });

  it("uses explicit event keys and reports missing selectors and malformed lines", () => {
    const result = compared(
      logLines({ message: "Original", operationId: 2 }) + "\n{malformed",
      logLines(
        { message: "Updated", operationId: 2 },
        { message: "Unqualified" },
      ),
      { matching: { eventIdentifiers: ["/operationId"] } },
    );
    expect(result.eventMatches).toContainEqual({
      baseline: 0,
      target: 0,
      reason: "Configured event identifiers",
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        kind: "missing-key",
        scope: "events",
        target: [1],
      }),
    );
    expect(result.parsingWarnings).toContainEqual(
      expect.objectContaining({ side: "baseline" }),
    );
  });
});
