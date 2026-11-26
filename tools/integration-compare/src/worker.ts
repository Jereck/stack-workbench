import {
  compareInputs,
  compareSessions,
} from "@stack-workbench/comparison-engine";
import type {
  Baseline,
  ComparisonConfiguration,
  ComparisonResult,
  Target,
  SessionRequest,
  SessionResult,
} from "@stack-workbench/comparison-engine";
import { serializeReport } from "./report";
import { hasCapability } from "@stack-workbench/shared/entitlements";
import type { Entitlements } from "@stack-workbench/shared/entitlements";
import { blockedFormats, comparisonSettings } from "./access";
import type { ReportData, ReportOptions } from "./report";

export interface ComparisonRequest {
  baseline: Baseline;
  target: Target;
  configuration?: ComparisonConfiguration;
}

export type WorkerReply<T> =
  { status: "completed"; result: T; durationMs: number } | { status: "failed" };
export type ComparisonReply = WorkerReply<ComparisonResult>;
export type PairSummary = {
  status: "equivalent" | "changed" | "failed";
  differences: number;
  message?: string;
};
type Work = { access: Entitlements } & (
  | ComparisonRequest
  | { kind: "batch"; request: ComparisonRequest }
  | { kind: "session"; request: SessionRequest }
  | { kind: "report"; report: ReportData; options: ReportOptions }
);

function execute(
  work: Work,
): ComparisonResult | SessionResult | PairSummary | Blob {
  if ("kind" in work) {
    if (work.kind === "session") {
      if (!hasCapability(work.access, "compare.sessions")) throw new Error();
      const { options } = work.request;
      const matching = hasCapability(work.access, "compare.session-matching");
      return compareSessions({
        ...work.request,
        options: {
          comparison: comparisonSettings(work.access, options?.comparison),
          matching: matching ? options?.matching : undefined,
          groups: matching ? options?.groups : undefined,
          overrides: matching ? options?.overrides : undefined,
        },
      });
    }
    if (work.kind === "report") {
      if (!hasCapability(work.access, "compare.reporting")) throw new Error();
      const { content, mime } = serializeReport(work.report, work.options);
      return new Blob([content], { type: mime + ";charset=utf-8" });
    }
    if (!hasCapability(work.access, "compare.batch")) throw new Error();
    const { baseline, target, configuration } = work.request;
    const result = compareInputs(
      baseline,
      target,
      {
        ...comparisonSettings(work.access, configuration),
        includeUnchanged: false,
      },
      blockedFormats(work.access),
    );
    return result.status === "failed"
      ? { status: "failed", differences: 0, message: result.errors[0]?.message }
      : {
          status: result.equivalent ? "equivalent" : "changed",
          differences: result.statistics.totalDifferences,
        };
  }
  return compareInputs(
    work.baseline,
    work.target,
    comparisonSettings(work.access, work.configuration),
    blockedFormats(work.access),
  );
}

self.addEventListener("message", (message: MessageEvent<Work>) => {
  try {
    const start = performance.now();
    const result = execute(message.data);
    const reply: WorkerReply<typeof result> = {
      status: "completed",
      result,
      durationMs: performance.now() - start,
    };
    self.postMessage(reply);
  } catch {
    self.postMessage({ status: "failed" });
  }
});
