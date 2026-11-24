import { describe, expect, it } from "vitest";
import { parseLogs } from "../../packages/log-parser/src";
import {
  allRedactions,
  redact,
  redactText,
} from "../../packages/redaction-engine/src";
import { serializeEvents } from "../../tools/log-inspector/src/export";
import { browserLogs, sensitive } from "../fixtures/log-inspector";

describe("redaction and export", () => {
  it("masks common keys and encoded copies without changing original data", () => {
    const enabled = new Set(allRedactions);
    const original = {
      fields: sensitive,
      encoded: JSON.stringify(JSON.stringify(sensitive)),
      emailInText: "Contact synthetic@fixture.example for details.",
    };
    const exported = JSON.stringify(redact(original, enabled));
    for (const value of Object.values(sensitive))
      expect(exported).not.toContain(value);
    expect(exported).toContain("Contact [REDACTED] for details.");
    expect(original.fields).toBe(sensitive);
    expect(original.encoded).toContain(sensitive.password);
    for (const text of [
      "headers:\nAuthorization: Basic demo\n X-Secret",
      "Bearer synthetic-dev-token",
      "&lt;ns:client_secret&gt;DEMO&lt;/ns:client_secret&gt;",
      "/demo?%61pi_key=0123",
      "jdbc:postgresql://demo/db?user=demo",
      '{"\\u0070assword":{"nested":"hidden"}}',
      '{"headers":[{"name":"Authorization","value":"Basic test"}]}',
    ])
      expect(redactText(text, enabled)).toBe("[REDACTED]");
    expect(
      redact(
        {
          headers: [
            { name: "Authorization", value: "Basic test" },
            ["X-API-Key", "test-key"],
          ],
        },
        enabled,
      ),
    ).toEqual({
      headers: [
        { name: "Authorization", value: "[REDACTED]" },
        ["X-API-Key", "[REDACTED]"],
      ],
    });
  });

  it("supports choosing categories independently", () => {
    expect(redact(sensitive, new Set(["emails"]))).toEqual({
      ...sensitive,
      email: "[REDACTED]",
    });
    expect(redact(sensitive, new Set())).toBe(sensitive);
  });

  it("redacts both export formats while leaving raw events and payloads in memory intact", () => {
    const { events } = parseLogs(browserLogs);
    const chosen = events.slice(0, 1);
    const json = serializeEvents(chosen, "json", allRedactions);
    const text = serializeEvents(chosen, "text", allRedactions);
    expect(JSON.parse(json)).toHaveLength(1);
    expect(json).toContain("/payments");
    expect(text).toContain("Upstream rejected request");
    expect(text).toContain("Raw event");
    expect(json + text).not.toContain(sensitive.password);
    expect(chosen[0]?.raw).toContain(sensitive.password);
    expect(serializeEvents(chosen, "json", [])).toContain(sensitive.password);
  });
});
