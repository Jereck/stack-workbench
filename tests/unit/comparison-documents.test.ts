import { describe, expect, it } from "vitest";
import {
  compareInputs,
  serializeUnifiedDiff,
} from "../../packages/comparison-engine/src";
import type {
  ComparisonConfiguration,
  InputFormat,
} from "../../packages/comparison-engine/src";
import {
  completed,
  httpJsonResponse,
  soapFault,
  syntheticExternalEntity,
} from "../fixtures/integration-compare";

const compare = (
  baseline: string,
  target: string,
  configuration?: ComparisonConfiguration,
  format?: InputFormat,
) =>
  completed(
    compareInputs(
      { text: baseline, format },
      { text: target, format },
      configuration,
    ),
  );

describe("XML and SOAP comparison", () => {
  it("compares expanded names and case-sensitive attributes, preserving useful locations", () => {
    const baseline =
      '<?xml version="1.0"?><a:root xmlns:a="urn:example" xmlns:x="urn:attributes">\n  <a:item x:code="A">yes</a:item>\n</a:root>';
    const equivalent =
      '<root xmlns="urn:example" xmlns:y="urn:attributes"><item y:code="A">yes</item></root>';
    expect(compare(baseline, equivalent).equivalent).toBe(true);
    const result = compare(baseline, equivalent.replace('"A"', '"B"'));
    expect(result.differences).toEqual([
      expect.objectContaining({
        path: [
          "{urn:example}root",
          "{urn:example}item",
          0,
          "@attributes",
          "{urn:attributes}code",
        ],
        classification: "modified",
        baseline: "A",
        target: "B",
        baselineLocation: expect.objectContaining({ line: 2 }),
        targetLocation: expect.objectContaining({ line: 1 }),
      }),
    ]);
    expect(
      compare('<a:r xmlns:a="urn:one"/>', '<a:r xmlns:a="urn:two"/>').statistics
        .counts,
    ).toMatchObject({ added: 1, removed: 1 });
  });

  it("reports element reordering and distinguishes additions from changed values", () => {
    const result = compare(
      "<root><a>yes</a><b>go</b><c/></root>",
      "<root><new/><b>stop</b><a>yes</a></root>",
    );
    expect(result.statistics.counts).toMatchObject({
      added: 1,
      removed: 1,
      modified: 1,
      reordered: 1,
    });
    expect(result.differences).toContainEqual(
      expect.objectContaining({
        path: ["root", "#order"],
        baseline: ["a[0]", "b[0]"],
        target: ["b[0]", "a[0]"],
        classification: "reordered",
      }),
    );
    expect(
      compare("<root><a/>first<b/></root>", "<root><a/><b/>first</root>")
        .statistics.counts.reordered,
    ).toBe(1);
    expect(
      compare("<root><a/></root>", "<root><first/><a/></root>").statistics
        .counts.reordered,
    ).toBe(0);
  });

  it("matches identified XML siblings, warns about missing or duplicate attributes, and applies exclusions", () => {
    const configuration: ComparisonConfiguration = {
      xml: { identityAttributes: ["id"] },
      rules: [
        {
          id: "stamp",
          kind: "ignore-xml-attribute",
          name: "stamp",
          enabled: true,
        },
        { id: "note", kind: "ignore-xml-element", name: "note", enabled: true },
      ],
    };
    const result = compare(
      '<root stamp="A"><items><item id="a">1</item><item id="b">2</item><item>3</item></items><note>original</note></root>',
      '<root stamp="B"><items><item id="b">2</item><item id="a">7</item></items><note>updated</note></root>',
      configuration,
    );
    expect(result.statistics.counts).toMatchObject({
      modified: 1,
      reordered: 1,
      ignored: 2,
      "missing-match": 1,
    });
    expect(result.matchingWarnings[0]).toMatchObject({
      side: "baseline",
      kind: "missing-match",
      path: ["root", "items", 0, "item", 2],
    });
    const duplicates = compare(
      '<root><item id="1"/><item id="1"/></root>',
      '<root><item id="1"/></root>',
      configuration,
    );
    expect(duplicates.statistics.counts["ambiguous-match"]).toBe(3);
  });

  it("compares SOAP fault codes by namespace, reports fault values, and supports body scope", () => {
    const baseline = soapFault("s", "Server", "Unavailable", "left-request");
    const prefixOnly = soapFault(
      "soap",
      "Server",
      "Unavailable",
      "left-request",
    );
    expect(compare(baseline, prefixOnly).equivalent).toBe(true);
    const target = soapFault(
      "soap",
      "Client",
      "Invalid operation",
      "right-request",
    );
    const full = compare(baseline, target);
    expect(full.baseline.data.kind).toBe("soap");
    expect(full.statistics.counts.modified).toBe(3);
    const body = compare(baseline, target, { xml: { soapScope: "body" } });
    expect(
      body.differences.map(({ path, target }) => [path.at(-3), target]),
    ).toEqual([
      [0, "soap:Client"],
      [0, "Invalid operation"],
    ]);
    expect(body.differences.map(({ path }) => path.at(-4))).toEqual([
      "faultcode",
      "faultstring",
    ]);
    expect(
      compareInputs({ text: "<r/>", format: "soap" }, { text: target }),
    ).toMatchObject({ status: "failed" });
  });

  it("recognizes SOAP 1.2 codes and reasons and permits an explicit SOAP header exclusion", () => {
    function envelope(
      prefix: string,
      code: string,
      reason: string,
      id: string,
    ) {
      return (
        '<p:Envelope xmlns:p="http://www.w3.org/2003/05/soap-envelope" xmlns:' +
        prefix +
        '="urn:faults">' +
        "<p:Header><requestId>" +
        id +
        "</requestId></p:Header>" +
        "<p:Body><p:Fault><p:Code><p:Value>" +
        prefix +
        ":" +
        code +
        "</p:Value></p:Code>" +
        '<p:Reason><p:Text xml:lang="en">' +
        reason +
        "</p:Text></p:Reason></p:Fault></p:Body></p:Envelope>"
      );
    }
    const baseline = envelope("a", "Denied", "Request failed", "one");
    const target = envelope("b", "Denied", "Request failed", "two");
    const options: ComparisonConfiguration = {
      rules: [
        {
          id: "request",
          enabled: true,
          kind: "ignore-xml-element",
          name: "requestId",
        },
      ],
    };
    expect(compare(baseline, target, options).statistics.counts).toMatchObject({
      modified: 0,
      ignored: 1,
    });
    expect(
      compare(
        baseline,
        envelope("b", "Unknown", "Unknown operation", "two"),
        options,
      ).statistics.counts,
    ).toMatchObject({ modified: 2, ignored: 1 });
  });

  it("normalizes only requested value whitespace and honors xml:space in nested content", () => {
    expect(compare("<r>   A   B </r>", "<r>A B</r>").equivalent).toBe(false);
    const options = { xml: { normalizeWhitespace: true } };
    expect(compare("<r>   A   B </r>", "<r>A B</r>", options).equivalent).toBe(
      true,
    );
    expect(
      compare(
        '<r xml:space="preserve"><n> </n></r>',
        '<r xml:space="preserve"><n>  </n></r>',
        options,
      ).equivalent,
    ).toBe(false);
    expect(
      compare("<r><a>\u00a0</a></r>", "<r><a> </a></r>", options).equivalent,
    ).toBe(false);
  });

  it("rejects DTDs, invalid entities, extra content, malformed tails, and excess nesting", () => {
    for (const invalid of [
      syntheticExternalEntity,
      "<x>&missing;</x>",
      "<x/>trailing",
      "<x/><y/>",
      "<x><y></x>",
      "<x>".repeat(49) + "</x>".repeat(49),
    ]) {
      const result = compareInputs({ text: invalid }, { text: "<x/>" });
      expect(result).toMatchObject({
        status: "failed",
        errors: [{ side: "baseline", location: { line: 1 } }],
      });
      expect(result.inputs.baseline.text).toBe(invalid);
    }
    expect(
      compare("<x><!--ignored--><![CDATA[ab]]>c</x>", "<x>abc</x>").equivalent,
    ).toBe(true);
    expect(
      compare(
        '<img src="https://example.invalid/private"/>',
        '<img src="https://example.invalid/private"/>',
      ).equivalent,
    ).toBe(true);
  });
});

describe("HTTP payload comparison", () => {
  it("compares observed status, repeated header values, and semantic body changes", () => {
    const baseline = httpJsonResponse(
      200,
      '{"body":{"answer":3,"flag":true}}',
      ["Set-Cookie: a=demo", "Set-Cookie: b=demo", "X-Request-ID: alpha"],
    );
    const target = httpJsonResponse(502, '{"body":{"flag":true,"answer":4}}', [
      "x-request-id: beta",
      "set-cookie: a=demo",
      "set-cookie: missing=demo",
    ]);
    const result = compare(baseline, target, {
      rules: [
        {
          id: "request-id",
          kind: "ignore-http-header",
          name: "X-REQUEST-ID",
          enabled: true,
        },
      ],
    });
    expect(result.baseline.data.kind).toBe("http");
    expect(result.differences).toEqual([
      expect.objectContaining({
        path: ["status"],
        classification: "modified",
        baseline: 200,
        target: 502,
      }),
      expect.objectContaining({
        path: ["headers", "set-cookie", 1],
        classification: "modified",
        baseline: "b=demo",
        target: "missing=demo",
      }),
      expect.objectContaining({
        path: ["headers", "x-request-id"],
        classification: "ignored",
      }),
      expect.objectContaining({
        path: ["body", "body", "answer"],
        classification: "modified",
        baseline: 3,
        target: 4,
      }),
    ]);
  });

  it("parses repeated query values, protects untrusted names, and handles ignore rules independently", () => {
    const baseline =
      "GET https://example.invalid/orders?flag=one&flag=two&trace=1&__proto__=left HTTP/1.1\r\nHost: example.invalid";
    const target =
      "GET https://example.invalid/orders?__proto__=right&flag=one&flag=two&trace=2 HTTP/1.1\r\nhost: example.invalid";
    const result = compare(baseline, target, {
      arrays: { kind: "keyed", keys: ["id"] },
      rules: [
        { id: "trace", kind: "ignore-query", name: "trace", enabled: true },
      ],
    });
    expect(result.differences).toEqual([
      expect.objectContaining({
        path: ["query", "__proto__", 0],
        baseline: "left",
        target: "right",
        classification: "modified",
      }),
      expect.objectContaining({
        path: ["query", "trace"],
        classification: "ignored",
      }),
    ]);
    const data = result.baseline.data;
    if (data.kind !== "http") throw new Error("Expected HTTP.");
    expect(data.message).toMatchObject({
      kind: "request",
      address: "https://example.invalid/orders",
      path: "/orders",
    });
    expect(data.message.status).toBeUndefined();
    expect(data.message.query.flag).toEqual(["one", "two"]);
  });

  it("compares recorded durations only when both inputs provide them and never interprets arbitrary timing headers", () => {
    const baseline = httpJsonResponse(200, "{}", ["X-Duration: 123"]);
    const target = httpJsonResponse(200, "{}", ["X-Duration: 124"]);
    expect(
      compare(baseline, target).differences.map(({ path }) => path),
    ).toEqual([["headers", "x-duration", 0]]);
    const result = completed(
      compareInputs(
        { text: baseline, recordedDurationMs: 342 },
        { text: baseline, recordedDurationMs: 4821 },
      ),
    );
    expect(result.differences).toEqual([
      {
        path: ["recordedDurationMs"],
        classification: "modified",
        baseline: 342,
        target: 4821,
      },
    ]);
    expect(
      completed(
        compareInputs(
          { text: baseline },
          { text: baseline, recordedDurationMs: 4821 },
        ),
      ).equivalent,
    ).toBe(true);
  });

  it("compares XML bodies and reports malformed framing, invalid structured bodies, and unsupported encodings", () => {
    const body = "POST /orders HTTP/1.1\r\nContent-Type: text/xml\r\n\r\n";
    expect(
      compare(body + '<x a="1"/>', body + '<x a="2"/>').differences[0],
    ).toMatchObject({
      path: ["body", "x", "@attributes", "a"],
      classification: "modified",
    });
    for (const text of [
      "HTTP/1.1 unknown",
      "HTTP/1.1 200\r\ninvalid header",
      "GET /orders?q=%xy HTTP/1.1",
      "HTTP/1.1 200\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0",
      httpJsonResponse(200, "{malformed"),
      body + "<unclosed>",
    ]) {
      const result = compareInputs(
        { text, format: "http" },
        { text: "HTTP/1.1 200" },
      );
      expect(result).toMatchObject({
        status: "failed",
        errors: [{ side: "baseline" }],
      });
      expect(result.inputs.baseline.text).toBe(text);
    }
  });
});

describe("plain text and log comparisons", () => {
  it("aligns lines, identifies context and edits, and creates a unified diff", () => {
    const result = compare(
      "keep\nold\ncontext\ndelete\nsuffix\n",
      "keep\ninsert\nnew\ncontext\nsuffix\n",
    );
    expect(
      result.text?.rows.map(({ classification }) => classification),
    ).toEqual([
      "unchanged",
      "modified",
      "added",
      "unchanged",
      "removed",
      "unchanged",
    ]);
    expect(
      result.differences.map(({ classification }) => classification),
    ).toEqual(["modified", "added", "removed"]);
    if (!result.text) throw new Error("Expected aligned text.");
    expect(serializeUnifiedDiff(result.text)).toBe(
      "--- baseline\n+++ target\n@@ -1,5 +1,5 @@\n keep\n-old\n+insert\n+new\n context\n-delete\n suffix\n",
    );
    const ending = compare("", "none");
    if (!ending.text) throw new Error("Expected aligned text.");
    expect(serializeUnifiedDiff(ending.text)).toContain(
      "@@ -0,0 +1,1 @@\n+none\n\\ No newline",
    );
  });

  it("configures whitespace and line ending normalization, and reports a bounded alignment fallback", () => {
    expect(compare("keep\r\n", "keep\n").equivalent).toBe(true);
    expect(
      compare("keep\r\n", "keep\n", { text: { normalizeLineEndings: false } })
        .equivalent,
    ).toBe(false);
    expect(
      compare(" \tkeep    both\n", "keep both\n", {
        text: { normalizeWhitespace: true },
      }).equivalent,
    ).toBe(true);
    expect(compare("keep", "keep\n").equivalent).toBe(false);
    const baseline = Array.from(
      { length: 1050 },
      (_, i) => "baseline " + i,
    ).join("\n");
    const target = Array.from({ length: 1050 }, (_, i) => "target " + i).join(
      "\n",
    );
    expect(compare(baseline, target)).toMatchObject({
      text: { exactAlignment: false },
      notices: [{ kind: "text-alignment-limit" }],
      statistics: { totalDifferences: 1050 },
    });
  });

  it("auto-detects recognizable logs, reuses normalized events, and preserves parse warnings", () => {
    const line =
      '{"@t":"2026-01-01T12:00:00Z","@mt":"Synthetic request","status":200}';
    const baseline = line + "\n" + line;
    const target = line + "\n" + line.replace("200", "502");
    const result = compare(baseline, target);
    expect(result.baseline.data.kind).toBe("log");
    expect(result.differences).toContainEqual(
      expect.objectContaining({
        path: [1, "httpStatus"],
        baseline: 200,
        target: 502,
        classification: "modified",
      }),
    );
    const mixed = completed(
      compareInputs(
        { text: line + "\n{bad}", format: "log", logFormat: "ndjson" },
        { text: baseline, format: "log" },
      ),
    );
    expect(mixed.parsingWarnings).toEqual([
      expect.objectContaining({
        side: "baseline",
        count: 1,
        message: expect.stringContaining("Malformed"),
      }),
    ]);
    if (mixed.baseline.data.kind !== "log")
      throw new Error("Expected normalized logs.");
    expect(mixed.baseline.data.logs.events[1]?.raw).toBe("{bad}");
    expect(compare("[INFO] message", "[WARN] message").baseline.data.kind).toBe(
      "text",
    );
  });

  it("retains both values and reports different detected formats explicitly", () => {
    const result = compare('{"a":1}', "response body");
    expect(result.differences).toEqual([
      expect.objectContaining({
        path: [],
        classification: "type-changed",
        baseline: { a: 1 },
        target: "response body",
      }),
    ]);
    expect(result.notices[0]?.kind).toBe("different-formats");
  });
});
