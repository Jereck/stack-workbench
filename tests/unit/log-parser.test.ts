import { describe, expect, it } from "vitest";
import {
  parseLogs,
  filterEvents,
  groupCorrelations,
  inputExceedsLimit,
  MAX_EVENTS,
  MAX_INPUT_BYTES,
} from "../../packages/log-parser/src";
import {
  cloudwatch,
  compact,
  deepJson,
  invalidJson,
  multiline,
} from "../fixtures/log-inspector";

describe("log parsing and normalization", () => {
  it("preserves array event text, ordering, original offsets and missing values", () => {
    const first =
      '{ "timestamp": "2026-06-17T08:00:00.123456789-04:00", "message": "late", "level": "warning", "n": 1e2 }';
    const second =
      '{"timestamp":"2026-06-17T13:00:00.123456788+01:00","message":"early"}';
    const result = parseLogs(
      " \n[" + first + ",\n" + second + ',{"message":"no time"}]\n',
    );
    expect(result.format).toBe("json");
    expect(result.events.map(({ raw }) => raw)).toEqual([
      first,
      second,
      '{"message":"no time"}',
    ]);
    expect(result.events[2]?.timestamp).toBeUndefined();
    expect(result.events[0]).toMatchObject({
      level: "warn",
      properties: { n: 100 },
      timestamp: { offset: "-04:00", utc: "2026-06-17T12:00:00.123456789Z" },
    });
    expect(result.summary.earliest?.original).toContain("+01:00");
    expect(result.summary.latest?.original).toContain("-04:00");
    expect(
      filterEvents(result.events, { order: "oldest" }).map(
        (event) => event.message,
      ),
    ).toEqual(["early", "late", "no time"]);
  });

  it("detects NDJSON and retains a broken record with its exact raw text", () => {
    const input = '{"message":"start"}\r\n' + invalidJson + '\n{"msg":"end"}';
    const result = parseLogs(input);
    expect(result.format).toBe("ndjson");
    expect(result.events.map((event) => event.message)).toEqual([
      "start",
      invalidJson,
      "end",
    ]);
    expect(result.events.map(({ raw }) => raw).join("")).toBe(input);
    expect(result.events[1]?.warnings).not.toHaveLength(0);
  });

  it("detects Serilog compact defaults and accepts a text override", () => {
    const result = parseLogs(compact);
    expect(result.format).toBe("serilog-json");
    expect(result.events[0]).toMatchObject({
      message: "Payment attempt for {OrderId}",
      traceId: "trace-demo",
      spanId: "span-demo",
      logger: "Demo.Payments",
      level: "info",
      properties: { OrderId: "demo-1" },
    });
    const override = parseLogs(compact, "text");
    expect(override.events[0]).toMatchObject({
      raw: compact,
      message: compact,
      level: "unknown",
    });
    expect(override.events[0]?.traceId).toBeUndefined();
  });

  it("normalizes CloudWatch exports and Logs Insights result rows", () => {
    const result = parseLogs(cloudwatch);
    expect(result.format).toBe("cloudwatch");
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      message: "Partner delay",
      level: "warn",
      source: "stream-demo",
      correlationId: "shared",
      timestamp: { original: 1781703661000, offset: "UTC" },
    });
    const insights =
      '{"results":[[{"field":"@timestamp","value":"2026-06-17T13:42:00Z"},{"field":"@message","value":"[WARN] synthetic warning"}]]}';
    expect(parseLogs(insights).events[0]).toMatchObject({
      message: "synthetic warning",
      level: "warn",
    });
  });

  it("attaches multiline exceptions and keeps trailing unrecognized lines", () => {
    const result = parseLogs(multiline);
    expect(result.format).toBe("serilog-text");
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({
      level: "error",
      requestId: "shared",
      httpUrl: "/checkout",
      httpMethod: "POST",
      httpStatus: 503,
      exception: {
        type: "Demo.CheckoutException",
        stack: "   at Demo.Checkout.Send()",
        cause: {
          type: "System.TimeoutException",
          message: "Slow response",
          stack: "   at Demo.Partner.Receive()",
        },
      },
    });
    expect(result.events[2]?.message).toBe("unknown line preserved");
    expect(result.events.map(({ raw }) => raw).join("")).toBe(multiline);
  });

  it("keeps mixed records without fabricating times or grouping adjacent events", () => {
    const mixed = [
      "2026-06-17 10:00:00 [INF] First request requestId=shared",
      "line without a timestamp",
      '{"message":"third","correlationId":"shared"}',
      "[WARN] unrelated",
    ].join("\n");
    const { events } = parseLogs(mixed);
    expect(events.map(({ timestamp }) => timestamp?.utc)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(events[0]?.timestamp?.original).toBe("2026-06-17 10:00:00");
    expect(events[3]).toMatchObject({ level: "warn", warnings: [] });
    expect(
      filterEvents(events, { identifier: "shared" }).map(
        (event) => event.index,
      ),
    ).toEqual([0, 2]);
    expect(groupCorrelations(events)).toEqual([
      { field: "requestId", value: "shared", count: 1 },
      { field: "correlationId", value: "shared", count: 1 },
    ]);
  });

  it("extracts a multiline HTTP body while keeping the next log independent", () => {
    const input = [
      "HTTP/1.1 422 Unprocessable Entity",
      "Content-Type: application/json",
      "",
      "{",
      '  "reason": "invalid item"',
      "}",
      "[INFO] next event",
    ].join("\n");
    const { events } = parseLogs(input);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      httpStatus: 422,
      payloads: [{ kind: "JSON", role: "response", path: "message.body" }],
    });
    expect(events[1]?.message).toBe("next event");
    const xml = [
      "2026-06-17 09:42:00 -04:00 [WRN] Response body: <result>",
      "<status>retry</status>",
      "</result>",
      "[INFO] next event",
    ].join("\n");
    expect(parseLogs(xml).events.map(({ payloads }) => payloads)).toEqual([
      [
        expect.objectContaining({
          kind: "XML",
          role: "response",
          text: "<result>\n<status>retry</status>\n</result>",
        }),
      ],
      [],
    ]);
  });

  it("bounds bytes, nesting, and event counts while retaining overflow", () => {
    expect(() => parseLogs("x".repeat(MAX_INPUT_BYTES + 1))).toThrow("4 MiB");
    expect(inputExceedsLimit("한".repeat(Math.ceil(MAX_INPUT_BYTES / 3)))).toBe(
      true,
    );
    const deep = parseLogs(deepJson);
    expect(deep.events[0]?.raw).toBe(deepJson);
    expect(deep.events[0]?.warnings.length).toBeGreaterThan(0);
    const many = "line\n".repeat(MAX_EVENTS + 1);
    const result = parseLogs(many, "text");
    expect(result.events).toHaveLength(MAX_EVENTS);
    expect(result.events.at(-1)?.raw).toBe("line\nline\n");
    expect(result.events.map(({ raw }) => raw).join("")).toBe(many);
  });
});

describe("event exploration", () => {
  it("combines payload search, severity and exception filters", () => {
    const { events } = parseLogs(
      multiline +
        '\n{"level":"error","message":"Second failure","payload":"{\\"status\\":\\"retrying\\"}","requestId":"shared"}',
    );
    expect(
      filterEvents(events, { query: "RETRYING", severity: "error" }).map(
        (event) => event.index,
      ),
    ).toEqual([3]);
    expect(
      filterEvents(events, { severity: "error", exceptionsOnly: true }).map(
        (event) => event.index,
      ),
    ).toEqual([0]);
    expect(groupCorrelations(events)).toEqual([
      { field: "requestId", value: "shared", count: 3 },
    ]);
  });
});
