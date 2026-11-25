import { compareInputs } from "@stack-workbench/comparison-engine";
import type {
  Baseline,
  ComparisonConfiguration,
  ComparisonResult,
  Target,
} from "@stack-workbench/comparison-engine";

export interface ComparisonRequest {
  baseline: Baseline;
  target: Target;
  configuration?: ComparisonConfiguration;
}

export type ComparisonReply =
  | { status: "completed"; result: ComparisonResult; durationMs: number }
  | { status: "failed" };

self.addEventListener("message", (message: MessageEvent<ComparisonRequest>) => {
  const { baseline, target, configuration } = message.data;
  try {
    const start = performance.now();
    const result = compareInputs(baseline, target, configuration);
    const reply: ComparisonReply = {
      status: "completed",
      result,
      durationMs: performance.now() - start,
    };
    self.postMessage(reply);
  } catch {
    self.postMessage({ status: "failed" } satisfies ComparisonReply);
  }
});
