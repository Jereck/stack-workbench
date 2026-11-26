import { describe, expect, it } from "vitest";
import {
  compareInputs,
  compareSessions,
  parseComparisonProfile,
  serializeComparisonProfile,
} from "../../packages/comparison-engine/src";
import {
  pairReport,
  serializeReport,
  sessionReport,
} from "../../tools/integration-compare/src/report";
import { logLines, transaction } from "../fixtures/comparison-session";

const date = "2026-11-25T12:00:00.000Z";

describe("comparison profiles", () => {
  it("round-trips versioned rules, format choices and matching settings", () => {
    const profile = parseComparisonProfile(
      JSON.stringify({
        version: 1,
        name: "Test profile",
        baselineFormat: "http",
        targetFormat: "xml",
        configuration: {
          xml: { soapScope: "body" },
          arrays: { kind: "keyed", keys: ["id"] },
          rules: [
            { id: "time", enabled: true, kind: "ignore-path", path: "/stamp" },
          ],
        },
        session: { includeService: false, payloadIdentifiers: ["/order"] },
      }),
    );
    expect(parseComparisonProfile(serializeComparisonProfile(profile))).toEqual(
      profile,
    );
    expect(profile.session?.payloadIdentifiers).toEqual(["/order"]);
  });
  it.each([
    '{"version":2,"name":"Future","configuration":{}}',
    '{"version":1,"name":"Payload","configuration":{"raw":"demo"}}',
    '{"version":1,"name":"Unsafe","configuration":{"__proto__":{"polluted":true}}}',
    '{"version":1,"name":"Bad rule","configuration":{"rules":[{"id":"x","enabled":false,"kind":"ignore-path","path":"bad"}]}}',
    '{"version":1,"name":"Bad paths","configuration":{},"session":{"payloadIdentifiers":["foo"]}}',
  ])("rejects malformed or unrecognized profile settings", (encoded) => {
    expect(() => parseComparisonProfile(encoded)).toThrow(
      "Invalid comparison profile",
    );
    expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
  });
});

describe("regression reports", () => {
  it("omits values by default and redacts path-aware scalar and nested evidence", () => {
    const result = compareInputs(
      {
        text: '{"credentials":{"password":"before-secret"},"items":[{"email":"a@example.invalid"}]}',
      },
      {
        text: '{"credentials":{"password":"after-secret"},"items":[{"email":"b@example.invalid"},{"apiKey":"second-secret"}]}',
      },
    );
    if (result.status !== "compared") throw new Error("Compare fixture failed");
    const data = pairReport(
      result,
      { baseline: "Baseline", target: "QA" },
      {},
      date,
    );
    const limited = serializeReport(data, {
      format: "json",
      includeValues: false,
      redact: false,
    }).content;
    expect(limited).not.toContain("after-secret");
    expect(limited).not.toContain('"baseline": "before-secret"');
    const masked = serializeReport(data, {
      format: "json",
      includeValues: true,
      redact: true,
    }).content;
    for (const secret of [
      "before-secret",
      "after-secret",
      "second-secret",
      "@example.invalid",
    ])
      expect(masked).not.toContain(secret);
    expect(masked).toContain("[REDACTED]");
    expect(JSON.parse(masked)).toMatchObject({
      date,
      workflow: "payload",
      statistics: { totalDifferences: 3 },
    });
    const unredacted = serializeReport(data, {
      format: "json",
      includeValues: true,
      redact: false,
    }).content;
    expect(unredacted).toContain("after-secret");
  });

  it("escapes printable markup and protects spreadsheet cells", () => {
    const result = compareInputs({ text: '{"one":1}' }, { text: '{"one":2}' });
    if (result.status !== "compared") throw new Error("Compare fixture failed");
    const data = pairReport(
      result,
      { baseline: " \t=1+1", target: '<img src="https://example.invalid">' },
      {},
      date,
    );
    const csv = serializeReport(data, {
      format: "csv",
      includeValues: true,
      redact: false,
    }).content;
    expect(csv).toContain('"\' \t=1+1"');
    const printed = serializeReport(data, {
      format: "html",
      includeValues: false,
      redact: false,
    }).content;
    expect(printed).toContain(
      "&lt;img src=&quot;https://example.invalid&quot;&gt;",
    );
    expect(printed).not.toContain("<img");
    expect(printed).toContain("@media print");
    const markdown = serializeReport(data, {
      format: "markdown",
      includeValues: false,
      redact: false,
    }).content;
    expect(markdown).toContain("## Evidence");
    expect(markdown).toContain("Evidence #1");
  });

  it("preserves session observation references, with group values excluded from metadata", () => {
    const options = {
      groups: {
        baseline: { field: "traceId" as const, value: "trace-dev" },
        target: { field: "traceId" as const, value: "trace-qa" },
      },
    };
    const result = compareSessions({
      baseline: { text: logLines(...transaction({ environment: "dev" })) },
      target: {
        text: logLines(...transaction({ environment: "qa", status: 502 })),
      },
      options,
    });
    if (result.status !== "compared") throw new Error("Compare fixture failed");
    const report = sessionReport(
      result,
      { baseline: "DEV", target: "QA" },
      options,
      date,
    );
    const content = serializeReport(report, {
      format: "json",
      includeValues: false,
      redact: true,
    }).content;
    const output = JSON.parse(content);
    expect(content).not.toContain("trace-dev");
    const observation = report.observations.find(({ message }) =>
      message.includes("200 to 502"),
    )!;
    expect(
      output.findings.find(
        ({ id }: { id: number }) => id === observation.evidence[0],
      ).evidence,
    ).toEqual({ baseline: [1, 2], target: [1, 2] });
  });
});
