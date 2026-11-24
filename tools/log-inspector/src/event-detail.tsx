import { useState } from "react";
import type { ReactNode } from "react";
import type { LogEvent, LogException } from "@stack-workbench/log-parser";
import { CodeView, CopyButton } from "./code-view";
import { levelLabels, levelStyles } from "./summary";

function DetailSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="min-w-0 rounded-lg border border-border bg-surface"
    >
      <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent">
        {label}
      </summary>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </details>
  );
}

function ExceptionDetails({ exception }: { exception: LogException }) {
  return (
    <div className="min-w-0 space-y-3">
      {exception.type && (
        <p className="font-mono text-sm font-semibold wrap-anywhere">
          {exception.type}
        </p>
      )}
      {exception.message && (
        <p className="text-sm whitespace-pre-wrap wrap-anywhere">
          {exception.message}
        </p>
      )}
      {exception.stack && (
        <CodeView label="Stack trace" text={exception.stack} />
      )}
      {exception.cause && (
        <div className="border-l-2 border-border pl-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Caused by
          </p>
          <ExceptionDetails exception={exception.cause} />
        </div>
      )}
    </div>
  );
}

function Properties({
  properties,
}: {
  properties: NonNullable<LogEvent["properties"]>;
}) {
  return (
    <CodeView
      label="Properties"
      text={JSON.stringify(properties)}
      language="JSON"
    />
  );
}

function EventDetails({
  event,
  exceptionsFirst,
}: {
  event: LogEvent;
  exceptionsFirst: boolean;
}) {
  const fields = [
    ["Timestamp", event.timestamp?.original],
    ["Recorded timezone", event.timestamp?.offset],
    ["UTC timestamp", event.timestamp?.utc],
    ["Source", event.source],
    ["Service", event.service],
    ["Logger category", event.logger],
    ["Trace ID", event.traceId],
    ["Span ID", event.spanId],
    ["Correlation ID", event.correlationId],
    ["Request ID", event.requestId],
    ["HTTP method", event.httpMethod],
    ["HTTP URL or path", event.httpUrl],
    ["HTTP status", event.httpStatus],
  ].filter(([, value]) => value !== undefined);
  return (
    <div className="min-w-0 space-y-3 border-t border-border bg-background px-4 py-4">
      {event.message && (
        <div className="space-y-2">
          <p className="line-clamp-8 text-sm whitespace-pre-wrap wrap-anywhere">
            {event.message.slice(0, 3_000)}
          </p>
          <CopyButton text={event.message} label="Copy message" />
        </div>
      )}
      {fields.length > 0 && (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-mono text-xs wrap-anywhere">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {event.warnings.length > 0 && (
        <ul
          aria-label="Event warnings"
          className="list-disc space-y-1 pl-5 text-sm text-muted-foreground"
        >
          {event.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {event.exception &&
        (exceptionsFirst ? (
          <ExceptionDetails exception={event.exception} />
        ) : (
          <DetailSection label="Exception and stack trace">
            <ExceptionDetails exception={event.exception} />
          </DetailSection>
        ))}
      {event.payloads.map((payload, index) => (
        <DetailSection
          key={index}
          label={[payload.kind, payload.role, payload.path.slice(0, 120)]
            .filter(Boolean)
            .join(" · ")}
        >
          <CodeView
            text={payload.text}
            label="Decoded payload"
            language={payload.kind}
          />
          {payload.original !== undefined && (
            <div className="mt-3">
              <DetailSection label="Original encoded value">
                <CodeView label="Original value" text={payload.original} />
              </DetailSection>
            </div>
          )}
        </DetailSection>
      ))}
      {event.properties && (
        <DetailSection label="Structured properties">
          <Properties properties={event.properties} />
        </DetailSection>
      )}
      <DetailSection label="Original raw event">
        <CodeView label="Raw event" text={event.raw} />
      </DetailSection>
    </div>
  );
}

export function EventRow({
  event,
  selected,
  onSelect,
  exceptionsFirst,
}: {
  event: LogEvent;
  selected: boolean;
  onSelect: (index: number, checked: boolean) => void;
  exceptionsFirst: boolean;
}) {
  const [open, setOpen] = useState(false);
  const text =
    (exceptionsFirst
      ? (event.exception?.type ?? event.exception?.message)
      : undefined) ??
    (event.message || event.warnings[0] || "Event has no message");
  return (
    <li className="relative min-w-0">
      <input
        type="checkbox"
        aria-label={"Select event " + (event.index + 1)}
        checked={selected}
        onChange={(change) => onSelect(event.index, change.target.checked)}
        className="absolute top-4 left-4 z-10 size-4 accent-accent"
      />
      <details
        className="group/event"
        onToggle={(change) => setOpen(change.currentTarget.open)}
      >
        <summary className="relative grid min-h-12 cursor-pointer grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1 py-2 pr-9 pl-11 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:grid-cols-[4rem_15rem_minmax(0,1fr)]">
          <span
            className={
              "w-fit rounded px-2 py-1 text-xs font-semibold " +
              levelStyles[event.level]
            }
          >
            {levelLabels[event.level]}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {event.timestamp?.original ?? "—"}
          </span>
          <span className="col-span-2 truncate text-sm font-medium sm:col-span-1">
            {text.slice(0, 400)}
          </span>
          <span
            aria-hidden="true"
            className="absolute top-4 right-4 size-2 -rotate-45 border-r border-b border-muted-foreground group-open/event:rotate-45"
          />
        </summary>
        {open && (
          <EventDetails event={event} exceptionsFirst={exceptionsFirst} />
        )}
      </details>
    </li>
  );
}
