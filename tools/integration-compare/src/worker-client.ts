import type {
  ComparisonResult,
  SessionRequest,
  SessionResult,
} from "@stack-workbench/comparison-engine";
import type { ReportData, ReportOptions } from "./report";
import type { ComparisonRequest, PairSummary, WorkerReply } from "./worker";
import type { Entitlements } from "@stack-workbench/shared/entitlements";

export type { ComparisonRequest } from "./worker";
export type WorkerOutcome<T = ComparisonResult> =
  WorkerReply<T> | { status: "cancelled" };

function startJob<T>(request: unknown): {
  result: Promise<WorkerOutcome<T>>;
  cancel: () => void;
} {
  let cancel = () => {};
  const result = new Promise<WorkerOutcome<T>>((resolve) => {
    let worker: Worker | undefined;
    function finish(outcome: WorkerOutcome<T>) {
      worker?.terminate();
      worker = undefined;
      resolve(outcome);
    }
    cancel = () => finish({ status: "cancelled" });
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (message: MessageEvent<WorkerReply<T>>) =>
        finish(message.data);
      worker.onmessageerror = () => finish({ status: "failed" });
      worker.onerror = (event) => {
        event.preventDefault();
        finish({ status: "failed" });
      };
      worker.postMessage(request);
    } catch {
      finish({ status: "failed" });
    }
  });
  return { result, cancel };
}

export const startComparison = (
  request: ComparisonRequest,
  access: Entitlements,
) => startJob<ComparisonResult>({ ...request, access });
export const startBatchPair = (
  request: ComparisonRequest,
  access: Entitlements,
) => startJob<PairSummary>({ kind: "batch", request, access });
export const startSession = (request: SessionRequest, access: Entitlements) =>
  startJob<SessionResult>({ kind: "session", request, access });
export const startReport = (
  report: ReportData,
  options: ReportOptions,
  access: Entitlements,
) => startJob<Blob>({ kind: "report", report, options, access });
