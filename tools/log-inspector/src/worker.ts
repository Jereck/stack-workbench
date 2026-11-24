import { InputLimitError, parseLogs } from "@stack-workbench/log-parser";
import type {
  LogEvent,
  LogFormat,
  LogResult,
} from "@stack-workbench/log-parser";
import type { RedactionCategory } from "@stack-workbench/redaction-engine";
import { serializeEvents } from "./export";
import type { ExportFormat } from "./export";

export type WorkerRequest =
  | { type: "parse"; text: string; format: LogFormat }
  | {
      type: "export";
      events: LogEvent[];
      format: ExportFormat;
      categories: RedactionCategory[];
    };

export type WorkerReply =
  | { type: "parsed"; result: LogResult; duration: number }
  | { type: "exported"; blob: Blob; format: ExportFormat }
  | { type: "failed"; limit?: boolean };

self.addEventListener("message", (message: MessageEvent<WorkerRequest>) => {
  const operation = message.data;
  let reply: WorkerReply;
  try {
    if (operation.type === "parse") {
      const start = performance.now();
      const result = parseLogs(operation.text, operation.format);
      reply = { type: "parsed", result, duration: performance.now() - start };
    } else {
      const content = serializeEvents(
        operation.events,
        operation.format,
        operation.categories,
      );
      const type =
        operation.format === "json" ? "application/json" : "text/plain";
      reply = {
        type: "exported",
        blob: new Blob([content], { type: type + ";charset=utf-8" }),
        format: operation.format,
      };
    }
  } catch (error) {
    reply = { type: "failed", limit: error instanceof InputLimitError };
  }
  self.postMessage(reply);
});
