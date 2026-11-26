import { describe, expect, it } from "vitest";
import { getToolEntitlements } from "../../apps/web/src/lib/entitlements";
import {
  clearCompareTransfers,
  readCompareSlots,
  stageCompareTransfer,
  takeCompareTransfers,
} from "../../apps/web/src/lib/compare-handoff";
import { compareInputs } from "../../packages/comparison-engine/src";
import type { ComparisonConfiguration } from "../../packages/comparison-engine/src";
import {
  compareCapabilities,
  freeEntitlements,
  hasCapability,
  proEntitlements,
} from "../../packages/shared/src/entitlements";
import {
  blockedFormats,
  canUseRule,
  comparisonSettings,
} from "../../tools/integration-compare/src/access";

describe("comparison capabilities", () => {
  it("defaults to Free and accepts a resolved capability snapshot from the app boundary", () => {
    expect(getToolEntitlements()).toEqual(freeEntitlements);
    for (const capability of compareCapabilities) {
      expect(hasCapability(getToolEntitlements(), capability)).toBe(false);
      expect(
        hasCapability(getToolEntitlements(proEntitlements), capability),
      ).toBe(true);
    }
  });

  it("blocks automatically detected and explicitly selected Pro formats before parsing them", () => {
    for (const [input, format] of [
      [{ text: "HTTP/1.1 200 OK\n\n{}" }, "http"],
      [{ text: "arbitrary input", format: "http" }, "http"],
      [{ text: '{"@t":"2026-01-01T00:00:00Z","@mt":"Synthetic"}' }, "log"],
      [{ text: "arbitrary input", format: "log" }, "log"],
    ] as const) {
      expect(
        compareInputs(
          input,
          { text: "{}" },
          {},
          blockedFormats(freeEntitlements),
        ),
      ).toMatchObject({
        status: "failed",
        errors: [{ side: "baseline", restrictedFormat: format }],
      });
    }
    expect(
      compareInputs(
        { text: "HTTP/1.1 200 OK\n\n{}" },
        { text: "HTTP/1.1 503 Unavailable\n\n{}" },
        {},
        blockedFormats(proEntitlements),
      ),
    ).toMatchObject({
      status: "compared",
      statistics: { totalDifferences: 1 },
    });
    expect(
      compareInputs(
        { text: "HTTP/1.1 200 OK", format: "text" },
        { text: "HTTP/1.1 502", format: "text" },
        {},
        blockedFormats(freeEntitlements),
      ),
    ).toMatchObject({
      status: "compared",
      statistics: { totalDifferences: 1 },
    });
  });

  it("preserves exact path ignores and filters other rules and options by capability", () => {
    const settings: ComparisonConfiguration = {
      mode: "structure",
      arrays: { kind: "keyed", keys: ["id"] },
      xml: { soapScope: "body", identityAttributes: ["id"] },
      text: { normalizeWhitespace: true },
      includeUnchanged: true,
      rules: [
        { id: "exact", kind: "ignore-path", path: "/foo/~2", enabled: true },
        { id: "wild", kind: "ignore-path", path: "/items/*/id", enabled: true },
        { id: "case", kind: "ignore-case", path: "/name", enabled: true },
      ],
    };
    const free = comparisonSettings(freeEntitlements, settings);
    expect(free.rules?.map(({ id }) => id)).toEqual(["exact"]);
    expect(free.includeUnchanged).toBe(true);
    for (const key of ["mode", "arrays", "xml", "text"] as const)
      expect(free[key]).toBeUndefined();
    expect(
      settings.rules?.every((rule) => canUseRule(proEntitlements, rule)),
    ).toBe(true);
    expect(comparisonSettings(proEntitlements, settings)).toMatchObject(
      settings,
    );
    const partial = comparisonSettings(
      { tier: "pro", capabilities: ["compare.schema"] },
      settings,
    );
    expect(partial.mode).toBe("structure");
    expect(partial.arrays).toBeUndefined();
  });
});

describe("comparison handoff", () => {
  it("replaces slots independently, consumes them once, and clears on request", () => {
    clearCompareTransfers();
    for (const text of ['{"v":1}', '{"v":2}']) {
      expect(
        stageCompareTransfer(
          { kind: "payload", side: "baseline", format: "json", text },
          freeEntitlements,
        ),
      ).toBe(true);
    }
    expect(
      stageCompareTransfer(
        { kind: "payload", side: "target", format: "xml", text: "<demo/>" },
        freeEntitlements,
      ),
    ).toBe(true);
    expect(readCompareSlots()).toEqual([
      { kind: "payload", side: "baseline" },
      { kind: "payload", side: "target" },
    ]);
    expect(
      takeCompareTransfers(freeEntitlements).map(({ text }) => text),
    ).toEqual(['{"v":2}', "<demo/>"]);
    expect(readCompareSlots()).toEqual([]);
    expect(takeCompareTransfers(freeEntitlements)).toEqual([]);
    stageCompareTransfer(
      { kind: "payload", side: "target", format: "xml", text: "<another/>" },
      freeEntitlements,
    );
    clearCompareTransfers();
    expect(takeCompareTransfers(freeEntitlements)).toEqual([]);
  });

  it("checks session access at both ends and rejects oversized UTF-8 inputs", () => {
    clearCompareTransfers();
    const session = {
      kind: "session",
      side: "baseline",
      logFormat: "text",
      text: "synthetic logs",
    } as const;
    expect(stageCompareTransfer(session, freeEntitlements)).toBe(false);
    expect(stageCompareTransfer(session, proEntitlements)).toBe(true);
    expect(takeCompareTransfers(freeEntitlements)).toEqual([]);
    expect(takeCompareTransfers(proEntitlements)).toEqual([]);
    expect(
      stageCompareTransfer(
        { ...session, text: "é".repeat(2 * 1024 * 1024 + 1) },
        proEntitlements,
      ),
    ).toBe(false);
    expect(stageCompareTransfer(session, proEntitlements)).toBe(true);
    expect(takeCompareTransfers(proEntitlements)).toEqual([session]);
  });
});
