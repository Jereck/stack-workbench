import { describe, expect, it } from "vitest";
import {
  compareInputs,
  formatFieldPath,
  MAX_INPUT_BYTES,
  MAX_RESULT_ROWS,
} from "../../packages/comparison-engine/src";
import type {
  ComparisonConfiguration,
  ComparisonRule,
} from "../../packages/comparison-engine/src";
import { completed } from "../fixtures/integration-compare";

const compare = (
  baseline: string,
  target: string,
  configuration?: ComparisonConfiguration,
) =>
  completed(
    compareInputs(
      { text: baseline, format: "json" },
      { text: target, format: "json" },
      configuration,
    ),
  );

const path = (value: string): ComparisonRule => ({
  id: value,
  enabled: true,
  kind: "ignore-path",
  path: value,
});

describe("JSON payload comparison", () => {
  it("matches reordered properties and distinguishes types, missing, empty, zero, and false", () => {
    expect(
      compare('{"x":[{"b":2,"a":1}],"z":{}}', '{"z":{},"x":[{"a":1,"b":2}]}')
        .equivalent,
    ).toBe(true);
    const result = compare(
      '{"addedToTarget":{},"changed":false,"zero":0,"missing":null,"nested":{"child":[false,3]}}',
      '{"addedToTarget":[],"changed":"false","zero":"","new":null,"nested":{"child":[true,3]}}',
      { includeUnchanged: true },
    );
    expect(result.statistics).toMatchObject({
      totalDifferences: 6,
      counts: {
        added: 1,
        removed: 1,
        modified: 1,
        "type-changed": 3,
        unchanged: 1,
      },
    });
    expect(result.differences).toContainEqual(
      expect.objectContaining({
        path: ["missing"],
        baseline: null,
        target: undefined,
        classification: "removed",
      }),
    );
    expect(result.differences).toContainEqual(
      expect.objectContaining({
        path: ["nested", "child", 0],
        baseline: false,
        target: true,
        classification: "modified",
      }),
    );
    expect(result.differences).toContainEqual(
      expect.objectContaining({
        path: ["new"],
        baseline: undefined,
        target: null,
        classification: "added",
      }),
    );
  });

  it("applies positional or duplicate-aware unordered matching recursively", () => {
    const left = '[{"a":[1,2]},1,1,2]';
    const right = '[1,{"a":[2,1]},2,1]';
    expect(compare(left, right).statistics.totalDifferences).toBe(4);
    expect(
      compare(left, right, { arrays: { kind: "unordered" } }).equivalent,
    ).toBe(true);
    const multiset = compare("[1,7,1]", "[1,7,7]", {
      arrays: { kind: "unordered" },
    });
    expect(multiset.statistics.counts).toMatchObject({ added: 1, removed: 1 });
    expect(multiset.differences).toContainEqual(
      expect.objectContaining({ baseline: 1, classification: "removed" }),
    );
    expect(multiset.differences).toContainEqual(
      expect.objectContaining({ target: 7, classification: "added" }),
    );
  });

  it("matches composite IDs exactly and separates missing and ambiguous records", () => {
    const keyed: ComparisonConfiguration = {
      arrays: { kind: "keyed", keys: ["tenant", "id"] },
    };
    const result = compare(
      '[{"tenant":"a","id":0,"value":2},{"tenant":"b","id":false,"value":3}]',
      '[{"tenant":"b","id":false,"value":3},{"tenant":"a","id":0,"value":4}]',
      keyed,
    );
    expect(result.differences).toEqual([
      {
        path: [0, "value"],
        targetPath: [1, "value"],
        baseline: 2,
        target: 4,
        classification: "modified",
      },
    ]);
    const issues = compare(
      '[{"tenant":"a","id":1},{"tenant":"a","id":1},{"id":2},{"tenant":"a","id":9}]',
      '[{"tenant":"a","id":1},{"tenant":"a","id":3}]',
      keyed,
    );
    expect(issues.statistics.counts).toMatchObject({
      "ambiguous-match": 3,
      "missing-match": 1,
      added: 1,
      removed: 1,
      modified: 0,
    });
    expect(issues.matchingWarnings).toHaveLength(4);
    expect(issues.matchingWarnings).toContainEqual(
      expect.objectContaining({
        side: "target",
        path: [0],
        kind: "ambiguous-match",
      }),
    );
  });

  it("does not greedily lose valid matches when numbers overlap within tolerance", () => {
    const result = compare("[2,1]", "[2,3]", {
      arrays: { kind: "unordered" },
      rules: [
        {
          id: "tolerance",
          enabled: true,
          kind: "numeric-tolerance",
          path: "/*",
          absolute: 1,
        },
      ],
    });
    expect(result.equivalent).toBe(true);
    expect(result.differences).toEqual([
      expect.objectContaining({
        path: [0],
        baseline: 2,
        target: 3,
        classification: "ignored",
      }),
      expect.objectContaining({
        path: [1],
        baseline: 1,
        target: 2,
        classification: "ignored",
      }),
    ]);
  });

  it("applies named and wildcard path rules and leaves disabled or unselected paths visible", () => {
    const left =
      '{"literal/*":{"ts":"x"},"rows":[{"ts":"x","trace":"1","amount":1,"message":" Foo  Bar "}],"ts":"keep"}';
    const right =
      '{"literal/*":{"ts":"y"},"rows":[{"ts":"y","trace":"2","amount":1.05,"message":"foo bar"}],"ts":"flag"}';
    const rules: ComparisonRule[] = [
      path(formatFieldPath(["literal/*", "ts"])),
      path("/rows/*/ts"),
      { id: "trace", kind: "ignore-property", name: "trace", enabled: true },
      {
        id: "amount",
        kind: "numeric-tolerance",
        path: "/**/amount",
        absolute: 0.1,
        enabled: true,
      },
      {
        id: "spaces",
        kind: "ignore-whitespace",
        path: "/rows/0/message",
        enabled: true,
      },
      {
        id: "case",
        kind: "ignore-case",
        path: "/rows/0/message",
        enabled: true,
      },
      { ...path("/ts"), enabled: false },
    ];
    const result = compare(left, right, { rules });
    expect(result.statistics.counts).toMatchObject({ ignored: 5, modified: 1 });
    expect(
      result.differences.filter(
        ({ classification }) => classification === "modified",
      ),
    ).toEqual([
      {
        path: ["ts"],
        baseline: "keep",
        target: "flag",
        classification: "modified",
      },
    ]);
    expect(
      result.differences.find(({ rule }) => rule?.id === "case")?.explanation,
    ).toMatch(/case and whitespace/);
    expect(
      compare(
        '{"a":{"deep":{"flag":1}},"flag":2}',
        '{"a":{"deep":{"flag":2}},"flag":3}',
        {
          rules: [path("/**/flag")],
        },
      ).statistics.counts.ignored,
    ).toBe(2);
  });

  it("honors a scoped keyed rule and an unrelated scoped unordered strategy on large arrays", () => {
    const baseline = {
      positional: [1, 2],
      records: [{ id: 1 }, { id: 2 }],
      order: Array.from({ length: 400 }, (_, i) => i),
    };
    const target = {
      positional: [2, 1],
      records: [{ id: 2 }, { id: 1 }],
      order: [...baseline.order.slice(1), 900],
    };
    const result = compare(JSON.stringify(baseline), JSON.stringify(target), {
      rules: [
        {
          id: "records",
          enabled: true,
          kind: "array",
          path: "/records",
          strategy: { kind: "keyed", keys: ["id"] },
        },
        {
          id: "order",
          enabled: true,
          kind: "array",
          path: "/order",
          strategy: { kind: "unordered" },
        },
      ],
    });
    expect(result.statistics.counts).toMatchObject({
      modified: 2,
      added: 1,
      removed: 1,
    });
  });

  it("decodes escaped JSON only under explicit normalization and retains the original", () => {
    const encoded = JSON.stringify({
      nested: JSON.stringify(JSON.stringify({ ok: true })),
    });
    const ordinary = '{"nested":{"ok":true}}';
    expect(compare(encoded, ordinary).statistics.counts["type-changed"]).toBe(
      1,
    );
    const result = compare(encoded, ordinary, {
      json: { decodeEscaped: true },
    });
    expect(result.equivalent).toBe(true);
    expect(result.inputs.baseline.text).toBe(encoded);
    expect(
      compare('"{malformed"', '"{malformed"', { json: { decodeEscaped: true } })
        .equivalent,
    ).toBe(true);
  });

  it("compares observed shape without comparing scalar values or duplicate array shapes", () => {
    const baseline =
      '{"rows":[{"id":1},{"id":2}],"nested":{"x":1,"drop":false}}';
    const same = '{"rows":[{"id":3}],"nested":{"x":9,"drop":true}}';
    expect(compare(baseline, same, { mode: "structure" }).equivalent).toBe(
      true,
    );
    const changed = compare(
      baseline,
      '{"rows":[{"id":"3"}],"nested":{"x":{"deeper":9},"add":true}}',
      { mode: "structure" },
    );
    expect(
      changed.differences.map(({ path, classification }) => [
        formatFieldPath(path),
        classification,
      ]),
    ).toEqual([
      ["/nested/add", "added"],
      ["/nested/drop", "removed"],
      ["/nested/x", "type-changed"],
      ["/rows/0/id", "type-changed"],
    ]);
    expect(
      compare('[{"stable":0},{"id":1}]', '[{"stable":3},{"id":"1"}]', {
        mode: "structure",
      }).differences[0],
    ).toMatchObject({ path: [1, "id"], classification: "type-changed" });
  });

  it("retains malformed text, blocks excessive input, and compares prototype-like property names safely", () => {
    const malformed = '{"detail":"synthetic-private"';
    const invalid = compareInputs({ text: malformed }, { text: "{}" });
    expect(invalid).toMatchObject({
      status: "failed",
      errors: [
        { side: "baseline", message: expect.stringContaining("Invalid JSON") },
      ],
    });
    expect(
      JSON.stringify(invalid.status === "failed" && invalid.errors),
    ).not.toContain("synthetic-private");
    expect(invalid.inputs.baseline.text).toBe(malformed);
    const deep = "[".repeat(49) + "0" + "]".repeat(49);
    expect(compareInputs({ text: deep }, { text: "[]" })).toMatchObject({
      status: "failed",
    });
    expect(
      compareInputs(
        { text: "é".repeat(MAX_INPUT_BYTES / 2 + 1) },
        { text: "" },
      ),
    ).toMatchObject({
      status: "failed",
      errors: [{ side: "baseline", message: expect.stringContaining("4 MiB") }],
    });
    expect(
      compareInputs({ text: '{"id":9007199254740993}' }, { text: "{}" }),
    ).toMatchObject({
      status: "failed",
      errors: [
        { side: "baseline", message: expect.stringContaining("numeric range") },
      ],
    });
    const proto = compare(
      '{"__proto__":{"sentinel":true},"constructor":null}',
      '{"constructor":false}',
    );
    expect(proto.differences.map(({ path }) => path)).toEqual([
      ["__proto__"],
      ["constructor"],
    ]);
    expect(Object.hasOwn(Object.prototype, "sentinel")).toBe(false);
  });

  it("continues counting changes after the retained-row budget and fails bounded flexible matching explicitly", () => {
    const left = JSON.stringify(
      Array.from({ length: 10_000 }, (_, index) => index),
    );
    const right = JSON.stringify(
      Array.from({ length: 10_000 }, (_, index) => index + 1),
    );
    const result = compare(left, right);
    expect(result.differences).toHaveLength(MAX_RESULT_ROWS);
    expect(result.statistics).toMatchObject({
      totalDifferences: 10_000,
      omittedRows: 2_000,
    });
    expect(result.notices[0]?.kind).toBe("result-limit");
    expect(
      compareInputs(
        { text: left },
        { text: right },
        {
          arrays: { kind: "unordered" },
          rules: [
            {
              id: "tol",
              kind: "numeric-tolerance",
              path: "/*",
              absolute: 1,
              enabled: true,
            },
          ],
        },
      ),
    ).toMatchObject({
      status: "failed",
      errors: [{ message: expect.stringContaining("candidate limit") }],
    });
  });
});
