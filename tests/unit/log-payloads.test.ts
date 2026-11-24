import { describe, expect, it } from "vitest";
import {
  extractPayloads,
  MAX_PAYLOAD_LENGTH,
} from "../../packages/payload-parser/src";
import {
  deepJson,
  deliberateHtml,
  maliciousXml,
  soap,
} from "../fixtures/log-inspector";

const inspect = (value: unknown) =>
  extractPayloads([{ name: "message", value }]);

describe("payload extraction", () => {
  it("decodes escaped JSON and discovers nested JSON inside it", () => {
    const outer = JSON.stringify({ child: JSON.stringify({ total: 3 }) });
    const escaped = JSON.stringify(JSON.stringify(outer));
    const result = inspect(escaped);
    expect(result.payloads).toEqual([
      expect.objectContaining({
        kind: "JSON",
        original: escaped,
        path: "message",
        text: outer,
      }),
      expect.objectContaining({
        kind: "JSON",
        path: "message.child",
        text: '{"total":3}',
      }),
    ]);
  });

  it("separates request and response properties, including plain bodies", () => {
    const result = extractPayloads([
      {
        name: "properties",
        value: { request: { body: { item: 2 } }, responseBody: "accepted" },
      },
    ]);
    expect(result.payloads).toEqual([
      expect.objectContaining({
        kind: "JSON",
        role: "request",
        path: "properties.request.body",
        text: '{"item":2}',
      }),
      expect.objectContaining({
        kind: "Text",
        role: "response",
        path: "properties.responseBody",
        text: "accepted",
      }),
    ]);
    expect(inspect("Response body: refused").payloads[0]).toMatchObject({
      role: "response",
      kind: "Text",
      text: "refused",
    });
  });

  it("validates XML and distinguishes SOAP by namespace, including escaped XML", () => {
    expect(
      inspect("body " + soap + " following log text").payloads[0],
    ).toMatchObject({ kind: "SOAP", text: soap });
    const escaped = "&amp;lt;root&amp;gt;ok&amp;lt;/root&amp;gt;";
    expect(inspect(escaped).payloads[0]).toMatchObject({
      kind: "XML",
      text: "<root>ok</root>",
      original: escaped,
    });
    expect(
      inspect('<Envelope xmlns="urn:other"><Body /></Envelope>').payloads[0]
        ?.kind,
    ).toBe("XML");
  });

  it("blocks DTDs and keeps potentially malicious XML-looking text inert", () => {
    expect(inspect(maliciousXml).payloads).toEqual([]);
    expect(inspect(maliciousXml).warnings).toHaveLength(1);
    expect(inspect(deliberateHtml).payloads[0]).toMatchObject({
      kind: "XML",
      text: deliberateHtml,
    });
  });

  it("bounds decoding depth, scan work, payload size and malformed input", () => {
    let layered = '{"x":1}';
    for (let index = 0; index < 6; index++) layered = JSON.stringify(layered);
    expect(inspect(layered).payloads).toHaveLength(0);
    expect(inspect(layered).warnings.length).toBeGreaterThan(0);
    for (const invalid of [
      deepJson,
      '{"x":',
      "<root><child></root>",
      "{" + " ".repeat(MAX_PAYLOAD_LENGTH),
    ]) {
      expect(inspect(invalid).payloads).toHaveLength(0);
      expect(inspect(invalid).warnings.length).toBeGreaterThan(0);
    }
    const oversizedArray = {
      body: Array.from({ length: 600 }, (_, index) => '{"x":' + index + "}"),
    };
    expect(
      inspect(oversizedArray).warnings.some((warning) =>
        warning.includes("limit"),
      ),
    ).toBe(true);
  });
});
