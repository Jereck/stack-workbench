import { useState } from "react";
import { viewButtonClass } from "@stack-workbench/ui/workspace";
import type { ReactNode } from "react";
import type { LogEvent, LogException } from "@stack-workbench/log-parser";
import { CodeView, CopyButton } from "@stack-workbench/ui/code-view";
import { levelLabels, levelStyles } from "./summary";
import type { CompareTransfer } from "@stack-workbench/shared/tool-handoff";
import { CompareActions } from "./compare-actions";

export const eventColumns =
  "grid grid-cols-[3.75rem_minmax(0,1fr)] @[31rem]:grid-cols-[3.75rem_12.5rem_minmax(0,1fr)]";
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
      className="min-w-0 border-b border-border"
    >
      <summary className="cursor-pointer break-words px-2 py-2 text-ui font-medium hover:bg-surface-muted">
        {label}
      </summary>
      {open && <div className="px-2 pb-3">{children}</div>}
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

export function EventDetails({
  event,
  exceptionsFirst,
  onTransfer,
}: {
  event: LogEvent;
  exceptionsFirst: boolean;
  onTransfer?: (transfer: CompareTransfer) => void;
}) {
  const views = [
    "Overview",
    ...(event.properties ? ["Properties"] : []),
    ...(event.payloads.length ? ["Payloads"] : []),
    ...(event.exception ? ["Exception"] : []),
    "Raw event",
  ];
  const [view, setView] = useState(exceptionsFirst ? "Exception" : "Overview");
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
    <>
      <div
        role="group"
        aria-label="Event detail view"
        className="flex flex-wrap gap-x-1 border-b border-border px-2 pt-1"
      >
        {views.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={view === item}
            className={viewButtonClass}
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="min-w-0 px-3 py-3">
        {view === "Overview" && (
          <div className="space-y-3">
            {event.message ? (
              <div className="space-y-2">
                <p className="line-clamp-8 font-mono text-ui whitespace-pre-wrap wrap-anywhere">
                  {event.message.slice(0, 3_000)}
                </p>
                <CopyButton text={event.message} label="Copy message" />
              </div>
            ) : (
              <p className="text-ui text-muted-foreground">
                This event has no message.
              </p>
            )}
            {fields.length > 0 && (
              <dl className="divide-y divide-border border-y border-border">
                {fields.map(([label, value]) => (
                  <div
                    key={label}
                    className="grid min-w-0 gap-0.5 py-1.5 sm:grid-cols-[minmax(7.5rem,1fr)_minmax(0,2fr)] sm:gap-2"
                  >
                    <dt className="text-label text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="font-mono text-label wrap-anywhere">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {event.warnings.length > 0 && (
              <ul
                aria-label="Event warnings"
                className="list-disc space-y-1 pl-5 text-ui text-warning"
              >
                {event.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {(!event.payloads.length || !event.exception) && (
              <p className="text-label text-muted-foreground">
                {!event.payloads.length && "No extracted payloads."}{" "}
                {!event.exception && "No recognized exception."}
              </p>
            )}
          </div>
        )}
        {view === "Exception" && event.exception && (
          <ExceptionDetails exception={event.exception} />
        )}
        {view === "Properties" && event.properties && (
          <Properties properties={event.properties} />
        )}
        {view === "Raw event" && (
          <CodeView label="Raw event" text={event.raw} />
        )}
        {view === "Payloads" &&
          event.payloads.map((payload, index) => (
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
              {onTransfer && payload.kind !== "Text" && (
                <div className="mt-2">
                  <CompareActions
                    source="payload"
                    onSelect={(side) =>
                      onTransfer({
                        kind: "payload",
                        side,
                        text: payload.text,
                        format:
                          payload.kind === "JSON"
                            ? "json"
                            : payload.kind === "SOAP"
                              ? "soap"
                              : "xml",
                      })
                    }
                  />
                </div>
              )}
              {payload.original !== undefined && (
                <div className="mt-2">
                  <DetailSection label="Original encoded value">
                    <CodeView label="Original value" text={payload.original} />
                  </DetailSection>
                </div>
              )}
            </DetailSection>
          ))}
      </div>
    </>
  );
}

export function EventRow({
  event,
  selected,
  onSelect,
  exceptionsFirst,
  active,
  onOpen,
}: {
  event: LogEvent;
  selected: boolean;
  onSelect: (index: number, checked: boolean) => void;
  exceptionsFirst: boolean;
  active: boolean;
  onOpen: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const text =
    (exceptionsFirst
      ? (event.exception?.type ?? event.exception?.message)
      : undefined) ??
    (event.message || event.warnings[0] || "Event has no message");
  return (
    <li
      className={
        "grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] " +
        (active ? "bg-accent-soft shadow-[inset_2px_0_var(--accent)]" : "")
      }
    >
      <label className="grid place-items-center">
        <input
          type="checkbox"
          aria-label={"Select event " + (event.index + 1)}
          checked={selected}
          onChange={(change) => onSelect(event.index, change.target.checked)}
          className="size-4 accent-accent"
        />
      </label>
      <button
        type="button"
        aria-pressed={active}
        title="Inspect event"
        onClick={(click) => onOpen(event.index, click.currentTarget)}
        className={
          eventColumns +
          " min-h-9 min-w-0 items-center gap-x-2 gap-y-0.5 py-1.5 pr-3 text-left hover:bg-surface-muted aria-pressed:hover:bg-accent-soft focus-visible:-outline-offset-2"
        }
      >
        <span
          className={
            "w-fit rounded-control px-1.5 py-0.5 font-mono text-label font-medium " +
            levelStyles[event.level]
          }
        >
          {levelLabels[event.level]}
        </span>
        <span className="truncate font-mono text-label text-muted-foreground">
          {event.timestamp?.original ?? "—"}
        </span>
        <span className="col-span-2 truncate pl-1.5 font-mono text-label @[31rem]:col-span-1 @[31rem]:pl-0">
          {text.slice(0, 400)}
        </span>
      </button>
    </li>
  );
}
