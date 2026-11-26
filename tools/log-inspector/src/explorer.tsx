import {
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  filterEvents,
  groupCorrelations,
  levels,
} from "@stack-workbench/log-parser";
import type {
  Correlation,
  LogEvent,
  LogLevel,
  LogResult,
} from "@stack-workbench/log-parser";
import {
  allRedactions,
  redactionOptions,
} from "@stack-workbench/redaction-engine";
import type { RedactionCategory } from "@stack-workbench/redaction-engine";
import type { CompareTransfer } from "@stack-workbench/shared/tool-handoff";
import { Button } from "@stack-workbench/ui/button";
import {
  controlClass,
  EmptyState,
  viewButtonClass,
  WorkspaceToolbar,
} from "@stack-workbench/ui/workspace";
import { eventColumns, EventDetails, EventRow } from "./event-detail";
import type { ExportFormat } from "./export";
import { levelLabels } from "./summary";

const pageSize = 50;
const modes = ["Events", "Correlations", "Exceptions"] as const;
const correlationLabels = {
  traceId: "Trace ID",
  correlationId: "Correlation ID",
  requestId: "Request ID",
};

type Export = (
  events: LogEvent[],
  format: ExportFormat,
  categories: RedactionCategory[],
) => void;

function ExportControls({
  selected,
  filtered,
  busy,
  onExport,
}: {
  selected: LogEvent[];
  filtered: LogEvent[];
  busy: boolean;
  onExport: Export;
}) {
  const [scope, setScope] = useState<"filtered" | "selected">("filtered");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [enabled, setEnabled] = useState(true);
  const [categories, setCategories] = useState(allRedactions);
  const events = scope === "selected" ? selected : filtered;
  return (
    <details className="min-w-0 border-t border-border bg-surface">
      <summary className="w-fit cursor-pointer rounded-control px-2 py-1.5 text-ui font-medium hover:bg-surface-muted">
        Export events
      </summary>
      <div className="max-w-2xl space-y-3 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <label htmlFor="log-export-scope">Export scope</label>
            <select
              id="log-export-scope"
              className={controlClass}
              value={scope}
              onChange={(event) => setScope(event.target.value as typeof scope)}
            >
              <option value="filtered">
                Filtered events ({filtered.length})
              </option>
              <option value="selected">
                Selected events ({selected.length})
              </option>
            </select>
          </div>
          <div className="space-y-1 text-sm">
            <label htmlFor="log-export-format">Export format</label>
            <select
              id="log-export-format"
              className={controlClass}
              value={format}
              onChange={(event) =>
                setFormat(event.target.value as ExportFormat)
              }
            >
              <option value="json">Structured JSON</option>
              <option value="text">Readable text</option>
            </select>
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="sr-only">Redaction</legend>
          <label className="flex w-fit items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Redact sensitive values
          </label>
          {enabled && (
            <div className="grid gap-2 pl-6 text-sm sm:grid-cols-2">
              {allRedactions.map((category) => (
                <label key={category} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-accent"
                    checked={categories.includes(category)}
                    onChange={(event) =>
                      setCategories(
                        event.target.checked
                          ? [...categories, category]
                          : categories.filter((item) => item !== category),
                      )
                    }
                  />
                  {redactionOptions[category]}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <p className="text-sm text-muted-foreground">
          Automated redaction can miss secrets. Review the downloaded file
          before sharing it.
        </p>
        <Button
          disabled={
            busy || events.length === 0 || (enabled && categories.length === 0)
          }
          onClick={() => onExport(events, format, enabled ? categories : [])}
        >
          Download {format === "json" ? "JSON" : "text"}
        </Button>
      </div>
    </details>
  );
}

export function Explorer({
  result,
  busy,
  onExport,
  onTransfer,
}: {
  result: LogResult;
  busy: boolean;
  onExport: Export;
  onTransfer?: (transfer: CompareTransfer) => void;
}) {
  const [mode, setMode] = useState<(typeof modes)[number]>("Events");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<LogLevel | "">("");
  const [identifier, setIdentifier] = useState("");
  const [correlation, setCorrelation] = useState<Correlation>();
  const [groupQuery, setGroupQuery] = useState("");
  const [order, setOrder] = useState<"input" | "newest" | "oldest">("input");
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [page, setPage] = useState(0);
  const [inspectedIndex, setInspectedIndex] = useState<number>();
  const rowTrigger = useRef<HTMLButtonElement>(null);
  const focusInspector = useRef(false);
  const inspectorHeading = useRef<HTMLHeadingElement>(null);

  const deferredQuery = useDeferredValue(query);
  const showGroups = mode === "Correlations";
  const events = useMemo(
    () =>
      filterEvents(result.events, {
        query: deferredQuery,
        severity: severity || undefined,
        identifier,
        correlation,
        exceptionsOnly: mode === "Exceptions",
        order,
      }),
    [
      result.events,
      deferredQuery,
      severity,
      identifier,
      correlation,
      mode,
      order,
    ],
  );
  const selectedEvents = useMemo(
    () =>
      selected.size
        ? result.events.filter((event) => selected.has(event.index))
        : [],
    [result.events, selected],
  );
  const groups = useMemo(
    () => (showGroups ? groupCorrelations(result.events) : []),
    [result.events, showGroups],
  );
  const needle = groupQuery.trim().toLowerCase();
  const visibleGroups = useMemo(
    () =>
      needle
        ? groups.filter(({ value }) => value.toLowerCase().includes(needle))
        : groups,
    [groups, needle],
  );
  const count = showGroups ? visibleGroups.length : events.length;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(pageCount - 1, page);
  const start = currentPage * pageSize;
  const activeEvents = showGroups ? [] : events.slice(start, start + pageSize);
  const inspected = activeEvents.find(
    (event) => event.index === inspectedIndex,
  );

  useLayoutEffect(() => {
    if (!inspected || !focusInspector.current) return;
    focusInspector.current = false;
    inspectorHeading.current?.focus({
      preventScroll: window.matchMedia("(min-width: 1024px)").matches,
    });
  }, [inspected]);

  function closeInspector() {
    setInspectedIndex(undefined);
    rowTrigger.current?.focus();
    rowTrigger.current = null;
  }

  const allOnPage =
    activeEvents.length > 0 &&
    activeEvents.every((event) => selected.has(event.index));

  function selectEvents(indices: number[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const index of indices) {
        if (checked) next.add(index);
        else next.delete(index);
      }
      return next;
    });
  }

  function openGroup(group: Correlation) {
    setInspectedIndex(undefined);
    setCorrelation(group);
    setMode("Events");
    setIdentifier("");
    setQuery("");
    setSeverity("");
    setPage(0);
  }

  const pager = pageCount > 1 && (
    <nav
      aria-label="Results pages"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm"
    >
      <span className="text-muted-foreground">
        Page {currentPage + 1} of {pageCount}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={currentPage === 0}
          onClick={() => {
            setInspectedIndex(undefined);
            setPage(currentPage - 1);
          }}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={currentPage + 1 === pageCount}
          onClick={() => {
            setInspectedIndex(undefined);
            setPage(currentPage + 1);
          }}
        >
          Next
        </Button>
      </div>
    </nav>
  );

  return (
    <section
      aria-labelledby="log-explorer-title"
      className="min-w-0 border-b border-border bg-surface"
    >
      <WorkspaceToolbar className="min-h-10 gap-x-4 pb-0">
        <h2 id="log-explorer-title" className="pb-1 text-ui font-semibold">
          Event explorer
        </h2>
        <div
          role="group"
          aria-label="Explorer view"
          className="flex flex-wrap gap-x-1"
        >
          {modes.map((item) => (
            <button
              type="button"
              key={item}
              className={viewButtonClass}
              aria-pressed={mode === item}
              onClick={() => {
                setMode(item);
                setPage(0);
                setInspectedIndex(undefined);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </WorkspaceToolbar>
      <div className="border-b border-border px-3 pt-2">
        {showGroups ? (
          <label className="mb-2 block max-w-md space-y-1 text-label font-medium">
            <span>Find an identifier</span>
            <input
              className={controlClass}
              type="search"
              value={groupQuery}
              autoComplete="off"
              onChange={(event) => {
                setGroupQuery(event.target.value);
                setPage(0);
              }}
            />
          </label>
        ) : (
          <div className="space-y-2">
            <div className="grid gap-2 min-[360px]:grid-cols-2 lg:grid-cols-[1.35fr_0.75fr_0.9fr_0.8fr]">
              <label className="min-w-0 space-y-1 text-label font-medium">
                <span>Search logs</span>
                <input
                  className={controlClass}
                  type="search"
                  value={query}
                  autoComplete="off"
                  placeholder="Message, raw text, or payload"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <div className="space-y-1 text-label font-medium">
                <label htmlFor="log-severity">Severity</label>
                <select
                  id="log-severity"
                  className={controlClass}
                  value={severity}
                  onChange={(event) => {
                    setSeverity(event.target.value as typeof severity);
                    setPage(0);
                  }}
                >
                  <option value="">All severities</option>
                  {levels.map((level) => (
                    <option key={level} value={level}>
                      {levelLabels[level]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="space-y-1 text-label font-medium">
                <span>Correlation identifier</span>
                <input
                  className={controlClass}
                  value={identifier}
                  autoComplete="off"
                  placeholder="Exact ID"
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <div className="space-y-1 text-label font-medium">
                <label htmlFor="log-order">Sort events</label>
                <select
                  id="log-order"
                  className={controlClass}
                  value={order}
                  onChange={(event) => {
                    setOrder(event.target.value as typeof order);
                    setPage(0);
                  }}
                >
                  <option value="input">Input order</option>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            </div>
            {correlation && (
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm">
                <span className="min-w-0 wrap-anywhere">
                  {correlationLabels[correlation.field]}{" "}
                  <strong className="font-mono">{correlation.value}</strong>
                </span>
                <Button
                  variant="ghost"
                  className="min-h-9 px-2"
                  onClick={() => {
                    setCorrelation(undefined);
                    setPage(0);
                  }}
                >
                  Remove group filter
                </Button>
              </div>
            )}
            <ExportControls
              selected={selectedEvents}
              filtered={events}
              busy={busy || query !== deferredQuery}
              onExport={onExport}
            />
          </div>
        )}
      </div>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 border-b border-border bg-sidebar px-3 py-1 text-label text-muted-foreground">
        <p role="status" className="tabular-nums">
          {count.toLocaleString()}{" "}
          {showGroups ? "identifier groups" : "matching events"}
          {selected.size > 0 && !showGroups
            ? " · " + selected.size.toLocaleString() + " selected"
            : ""}
        </p>
        {!showGroups && activeEvents.length > 0 && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-accent"
              checked={allOnPage}
              onChange={(event) =>
                selectEvents(
                  activeEvents.map(({ index }) => index),
                  event.target.checked,
                )
              }
            />
            Select page
          </label>
        )}
      </div>
      {count === 0 ? (
        <EmptyState
          title={
            showGroups
              ? "No matching identifiers"
              : result.events.length === 0
                ? "No parsed events"
                : mode === "Exceptions" && result.summary.exceptions === 0
                  ? "No exceptions found"
                  : "No matching events"
          }
        >
          {showGroups
            ? "Try a different identifier."
            : result.events.length === 0
              ? "Check the source and format, then parse again."
              : mode === "Exceptions" && result.summary.exceptions === 0
                ? "Switch to Events to inspect the rest of the log."
                : "Change the search or filters to broaden your results."}
        </EmptyState>
      ) : showGroups ? (
        <>
          <ul
            aria-label="Correlation groups"
            className="divide-y divide-border"
          >
            {visibleGroups.slice(start, start + pageSize).map((group) => (
              <li key={group.field + ":" + group.value}>
                <button
                  type="button"
                  className="flex min-h-10 w-full min-w-0 items-center justify-between gap-3 px-3 py-1.5 text-left text-ui hover:bg-surface-muted focus-visible:-outline-offset-2"
                  onClick={() => openGroup(group)}
                >
                  <span className="min-w-0">
                    <span className="block text-label text-muted-foreground">
                      {correlationLabels[group.field]}
                    </span>
                    <span className="block truncate font-mono">
                      {group.value}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {group.count} {group.count === 1 ? "event" : "events"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pager}
        </>
      ) : (
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="@container min-w-0">
            <div
              aria-hidden="true"
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] border-b border-border bg-background"
            >
              <div
                className={
                  eventColumns +
                  " col-start-2 min-h-7 items-center gap-x-2 pr-3 text-label font-medium text-muted-foreground"
                }
              >
                <span className="pl-1.5">Level</span>
                <span>Timestamp</span>
                <span className="hidden @[31rem]:block">Message</span>
              </div>
            </div>
            <ol
              aria-label={
                mode === "Exceptions" ? "Events with exceptions" : "Log events"
              }
              key={mode + currentPage}
              className="max-h-[min(40dvh,32rem)] divide-y divide-border overflow-y-auto"
            >
              {activeEvents.map((event) => (
                <EventRow
                  key={event.index}
                  event={event}
                  selected={selected.has(event.index)}
                  onSelect={(index, checked) => selectEvents([index], checked)}
                  exceptionsFirst={mode === "Exceptions"}
                  active={inspected?.index === event.index}
                  onOpen={(index, trigger) => {
                    rowTrigger.current = trigger;
                    focusInspector.current = inspectedIndex !== index;
                    setInspectedIndex(index);
                    if (inspectedIndex === index)
                      inspectorHeading.current?.focus({
                        preventScroll: window.matchMedia("(min-width: 1024px)")
                          .matches,
                      });
                  }}
                />
              ))}
            </ol>
            {pager}
          </div>
          <section
            aria-labelledby="event-inspector-heading"
            className="min-w-0 border-t border-border bg-surface lg:border-l lg:border-t-0"
          >
            <div className="flex min-h-8 items-center justify-between gap-2 border-b border-border bg-background px-3 py-1">
              <h3
                id="event-inspector-heading"
                ref={inspectorHeading}
                tabIndex={-1}
                className="rounded-control text-label font-semibold"
              >
                {inspected ? "Event " + (inspected.index + 1) : "Event details"}
              </h3>
              {inspected && (
                <Button
                  variant="ghost"
                  className="min-h-6 px-1.5 py-0 text-label"
                  onClick={closeInspector}
                >
                  Back to events
                </Button>
              )}
            </div>
            {inspected ? (
              <EventDetails
                key={mode + inspected.index}
                event={inspected}
                exceptionsFirst={mode === "Exceptions"}
                onTransfer={onTransfer}
              />
            ) : (
              <EmptyState title="No event selected">
                Open an event to inspect its fields, payloads, or raw text.
              </EmptyState>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
