import type { LogEvent, LogException } from "@stack-workbench/log-parser";
import { redact, redactText } from "@stack-workbench/redaction-engine";
import type { RedactionCategory } from "@stack-workbench/redaction-engine";

export type ExportFormat = "json" | "text";

function exceptionText(
  exception: LogException,
  safe: (value: string) => string,
): string {
  return [
    [exception.type, exception.message]
      .filter((value) => value !== undefined)
      .map(safe)
      .join(": "),
    exception.stack && safe(exception.stack),
    exception.cause && "Caused by\n" + exceptionText(exception.cause, safe),
  ]
    .filter(Boolean)
    .join("\n");
}

export function serializeEvents(
  events: readonly LogEvent[],
  format: ExportFormat,
  categories: readonly RedactionCategory[],
): string {
  const enabled = new Set(categories);
  const safe = (value: string) => redactText(value, enabled);
  if (format === "json")
    return (
      "[\n" +
      events
        .map((event) => "  " + JSON.stringify(redact(event, enabled)))
        .join(",\n") +
      "\n]\n"
    );
  return (
    events
      .map((event) => {
        const metadata = [
          ["Source", event.source],
          ["Service", event.service],
          ["Logger", event.logger],
          ["Trace ID", event.traceId],
          ["Span ID", event.spanId],
          ["Correlation ID", event.correlationId],
          ["Request ID", event.requestId],
          [
            "HTTP",
            [event.httpMethod, event.httpUrl, event.httpStatus]
              .filter(Boolean)
              .join(" ") || undefined,
          ],
        ].flatMap(([label, value]) =>
          value === undefined ? [] : [label + "  " + safe(value)],
        );
        return [
          "#" +
            (event.index + 1) +
            "  " +
            event.level.toUpperCase() +
            (event.timestamp
              ? "  " + safe(String(event.timestamp.original))
              : ""),
          safe(event.message),
          ...metadata,
          event.exception &&
            "Exception\n" + exceptionText(event.exception, safe),
          event.properties &&
            "Properties\n" + JSON.stringify(redact(event.properties, enabled)),
          ...event.payloads.map((payload) =>
            [
              payload.kind + " · " + safe(payload.path),
              safe(payload.text),
              payload.original && "Original\n" + safe(payload.original),
            ]
              .filter(Boolean)
              .join("\n"),
          ),
          ...event.warnings.map((warning) => "Warning  " + safe(warning)),
          "Raw event\n" + safe(event.raw),
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n────────────────────────────────────────\n\n") + "\n"
  );
}
