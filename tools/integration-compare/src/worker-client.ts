import type { ComparisonReply, ComparisonRequest } from "./worker";

export type { ComparisonRequest } from "./worker";
export type WorkerOutcome = ComparisonReply | { status: "cancelled" };

export function startComparison(request: ComparisonRequest): {
  result: Promise<WorkerOutcome>;
  cancel: () => void;
} {
  let cancel = () => {};
  const result = new Promise<WorkerOutcome>((resolve) => {
    let worker: Worker | undefined;
    function finish(outcome: WorkerOutcome) {
      worker?.terminate();
      worker = undefined;
      resolve(outcome);
    }
    cancel = () => finish({ status: "cancelled" });
    try {
      worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (message: MessageEvent<ComparisonReply>) =>
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
