import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { formatFieldPath } from "@stack-workbench/comparison-engine";
import type {
  MatchIssue,
  SessionFinding,
  SessionMatch,
  SessionResult,
  SessionSide,
  Side,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import { CodeView } from "@stack-workbench/ui/code-view";
import { viewButtonClass } from "@stack-workbench/ui/workspace";
import { Pagination } from "./pagination";
import { clip, preview } from "./result-model";
import type { SideLabels } from "./result-model";

type ComparedSession = Extract<SessionResult, { status: "compared" }>;
const pageSize = 20;
const sides = ["baseline", "target"] as const;
const countLabel = (count: number, noun: string) =>
  count.toLocaleString("en-US") + " " + noun + (count === 1 ? "" : "s");
const numbered = (ids: readonly number[] | undefined) =>
  ids?.length
    ? ids
        .slice(0, 12)
        .map((id) => "#" + (id + 1))
        .join(", ") +
      (ids.length > 12 ? " and " + (ids.length - 12) + " more" : "")
    : "—";

function SideSummary({
  session,
  label,
}: {
  session: SessionSide;
  label: string;
}) {
  return (
    <section aria-label={label + " session summary"} className="min-w-0 p-3">
      <h3 className="font-semibold wrap-anywhere">{label} session</h3>
      <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-ui">
        {[
          ["Events", session.events.length],
          ["Transactions", session.transactions.length],
          ["Payloads", session.summary.payloads],
          ["Exceptions", session.summary.exceptions],
          ["Correlation groups", session.groups.length],
        ].map(([title, count]) => (
          <div key={title} className="flex gap-1.5">
            <dt className="text-muted-foreground">{title}</dt>
            <dd className="font-mono">{count}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-label text-secondary">
        Severity ·{" "}
        {Object.entries(session.summary.levels)
          .filter(([, count]) => count)
          .map(([name, count]) => name + " " + count)
          .join(" · ") || "No events"}
      </p>
      {session.services.length > 0 && (
        <p className="mt-1 text-label text-secondary wrap-anywhere">
          Services · {clip(session.services.slice(0, 12).join(", "), 400)}
          {session.services.length > 12
            ? " · " + session.services.length + " total"
            : ""}
        </p>
      )}
    </section>
  );
}

function EventDetails({
  events,
  id,
  label,
}: {
  events: readonly SessionSide["events"][number][];
  id: number;
  label: string;
}) {
  const event = events.find(({ index }) => index === id);
  if (!event) return null;
  return (
    <section
      aria-label="Selected log event"
      className="border-t border-border p-3"
    >
      <h3 className="text-ui font-semibold">
        {label} event #{event.index + 1}
      </h3>
      <p className="my-2 text-ui wrap-anywhere">
        {event.level} · {event.service || event.logger || "Unspecified service"}{" "}
        · {clip(event.message, 450)}
      </p>
      <p className="mb-2 text-label text-muted-foreground wrap-anywhere">
        {[
          event.traceId && "Trace " + event.traceId,
          event.correlationId && "Correlation " + event.correlationId,
          event.requestId && "Request " + event.requestId,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {event.exception && (
        <details className="mb-2">
          <summary className="cursor-pointer text-ui">Exception</summary>
          <CodeView
            label="Exception details"
            text={JSON.stringify(event.exception)}
            language="JSON"
          />
        </details>
      )}
      {event.payloads.map((payload, index) => (
        <details key={index} className="mb-2 min-w-0">
          <summary className="cursor-pointer text-ui wrap-anywhere">
            {payload.role ?? "Payload"} · {payload.kind} · {payload.path}
          </summary>
          <CodeView
            label="Captured payload"
            text={payload.text}
            language={payload.kind}
          />
        </details>
      ))}
      <details>
        <summary className="cursor-pointer text-ui">Source record</summary>
        <CodeView label="Original log record" text={event.raw} />
      </details>
    </section>
  );
}

function Findings({
  result,
  inspect,
}: {
  result: ComparedSession;
  inspect: (side: Side, id: number) => void;
}) {
  const [picked, setPicked] = useState<number>();
  const [page, setPage] = useState(0);
  const current =
    picked === undefined ? undefined : result.findings[picked - 1];
  return (
    <div className="min-w-0">
      <details open className="border-b border-border px-3 py-2">
        <summary className="cursor-pointer text-ui font-semibold">
          Regression observations
        </summary>
        {result.observations.length ? (
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-ui">
            {result.observations.map(({ message, evidence }, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-2">
                <span>{message}</span>
                {evidence.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="rounded-control text-accent underline"
                    onClick={() => {
                      setPicked(id);
                      setPage(Math.floor((id - 1) / pageSize));
                    }}
                  >
                    Evidence #{id}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-ui text-muted-foreground">
            No regression findings in the retained matched evidence. Review
            matching warnings for unresolved records.
          </p>
        )}
      </details>
      {result.findings.length > 0 && (
        <>
          <div
            role="region"
            aria-label="Scrollable session evidence"
            tabIndex={0}
            className="max-h-96 overflow-auto"
          >
            <table
              aria-label="Session findings"
              className="w-full min-w-[34rem] text-left text-ui"
            >
              <thead className="sticky top-0 bg-sidebar">
                <tr>
                  <th className="p-2" scope="col">
                    Evidence
                  </th>
                  <th className="p-2" scope="col">
                    Recorded change
                  </th>
                  <th className="p-2" scope="col">
                    Baseline events
                  </th>
                  <th className="p-2" scope="col">
                    Target events
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.findings
                  .slice(page * pageSize, (page + 1) * pageSize)
                  .map((finding) => (
                    <tr
                      key={finding.id}
                      className={
                        "border-b border-border " +
                        (picked === finding.id ? "bg-accent-soft" : "")
                      }
                    >
                      <th scope="row" className="p-2">
                        <button
                          type="button"
                          className="rounded-control font-mono text-accent underline"
                          onClick={() => setPicked(finding.id)}
                        >
                          Inspect #{finding.id}
                        </button>
                      </th>
                      <td className="p-2">{finding.description}</td>
                      <td className="p-2 font-mono text-label">
                        {numbered(finding.baselineEvents)}
                      </td>
                      <td className="p-2 font-mono text-label">
                        {numbered(finding.targetEvents)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination
            label="Session evidence"
            page={page}
            size={pageSize}
            total={result.findings.length}
            onChange={setPage}
          />
        </>
      )}
      {current && <SelectedFinding finding={current} inspect={inspect} />}
    </div>
  );
}

function SelectedFinding({
  finding,
  inspect,
}: {
  finding: SessionFinding;
  inspect: (side: Side, id: number) => void;
}) {
  const diff = finding.difference;
  return (
    <section
      aria-label="Selected session evidence"
      className="space-y-2 border-t border-border p-3"
    >
      <h3 className="text-ui font-semibold">
        Evidence #{finding.id} · {finding.description}
      </h3>
      {diff && (
        <p className="font-mono text-label wrap-anywhere">
          {formatFieldPath(diff.path) || "(root)"} · {diff.classification}
          {diff.rule && " · Rule " + diff.rule.id}
        </p>
      )}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {sides.map((side) => (
          <div key={side} className="min-w-0">
            <p className="font-medium capitalize text-ui">{side}</p>
            <p className="font-mono text-label wrap-anywhere">
              {diff ? preview(diff[side]) : ""}
            </p>
            {diff?.[side] !== undefined && (
              <details className="text-ui">
                <summary className="cursor-pointer">
                  Show full {side} value
                </summary>
                <CodeView
                  label={side + " finding value"}
                  text={
                    typeof diff[side] === "string"
                      ? diff[side]
                      : JSON.stringify(diff[side])
                  }
                />
              </details>
            )}
            {(side === "baseline"
              ? finding.baselineEvents
              : finding.targetEvents
            )
              ?.slice(0, 12)
              .map((id) => (
                <Button
                  key={id}
                  variant="ghost"
                  onClick={() => inspect(side, id)}
                >
                  Event #{id + 1}
                </Button>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Candidates({
  ids,
  side,
  render,
}: {
  ids: readonly number[];
  side: Side;
  render: (id: number) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  return ids.length ? (
    <>
      {ids.slice(page * 8, (page + 1) * 8).map(render)}
      {ids.length > 8 && (
        <Pagination
          label={side + " candidates"}
          page={page}
          size={8}
          total={ids.length}
          onChange={setPage}
        />
      )}
    </>
  ) : (
    "—"
  );
}

function MatchTable({
  result,
  scope,
  inspect,
}: {
  result: ComparedSession;
  scope: MatchIssue["scope"];
  inspect: (side: Side, id: number) => void;
}) {
  const [page, setPage] = useState(0);
  const transactions = scope === "transactions";
  const matches = transactions
    ? result.transactionMatches
    : result.eventMatches;
  const issues = useMemo(
    () => result.issues.filter((issue) => issue.scope === scope),
    [result, scope],
  );
  const entries: (SessionMatch | MatchIssue)[] = useMemo(
    () => [...matches, ...issues],
    [matches, issues],
  );
  const lookup = useMemo(
    () => ({
      baseline: new Map(
        result.baseline.transactions.map((entry) => [entry.id, entry]),
      ),
      target: new Map(
        result.target.transactions.map((entry) => [entry.id, entry]),
      ),
    }),
    [result],
  );
  return (
    <div className="min-w-0">
      <p className="px-3 py-2 text-ui text-muted-foreground">
        {matches.length} matched · {issues.length} unresolved or unmatched
        groups
      </p>
      {!entries.length && (
        <p className="px-3 pb-2 text-ui">No recorded {scope} to display.</p>
      )}
      {entries.length > 0 && (
        <div
          role="region"
          aria-label={"Scrollable matched " + scope}
          tabIndex={0}
          className="max-h-96 overflow-auto"
        >
          <table
            aria-label={"Matched and unmatched " + scope}
            className="w-full min-w-[35rem] text-left text-ui"
          >
            <thead className="sticky top-0 bg-sidebar">
              <tr>
                <th scope="col" className="p-2">
                  Baseline
                </th>
                <th scope="col" className="p-2">
                  Target
                </th>
                <th scope="col" className="p-2">
                  Matching evidence
                </th>
              </tr>
            </thead>
            <tbody>
              {entries
                .slice(page * pageSize, (page + 1) * pageSize)
                .map((entry, offset) => {
                  const issue = "kind" in entry;
                  return (
                    <tr
                      key={page * pageSize + offset}
                      className="border-b border-border align-top"
                    >
                      {sides.map((side) => {
                        const ids =
                          "kind" in entry ? entry[side] : [entry[side]];
                        return (
                          <td key={side} className="max-w-64 p-2 wrap-anywhere">
                            <Candidates
                              ids={ids}
                              side={side}
                              render={(id) => {
                                const tx = transactions
                                  ? lookup[side].get(id)
                                  : undefined;
                                return (
                                  <div key={id} className="mb-1">
                                    <button
                                      type="button"
                                      className="rounded-control font-mono text-accent underline"
                                      onClick={() =>
                                        inspect(side, tx?.events[0] ?? id)
                                      }
                                    >
                                      #{id + 1}
                                    </button>
                                    {tx && (
                                      <span className="ml-1 font-mono text-label">
                                        {clip(
                                          [
                                            tx.method,
                                            tx.endpoint,
                                            tx.status,
                                            tx.durationMs !== undefined
                                              ? tx.durationMs + " ms"
                                              : "",
                                          ]
                                            .filter(Boolean)
                                            .join(" "),
                                          120,
                                        )}
                                      </span>
                                    )}
                                    {tx?.events.slice(1).map((event) => (
                                      <Button
                                        key={event}
                                        variant="ghost"
                                        onClick={() => inspect(side, event)}
                                      >
                                        Event #{event + 1}
                                      </Button>
                                    ))}
                                  </div>
                                );
                              }}
                            />
                          </td>
                        );
                      })}
                      <td className="p-2">
                        {issue && (
                          <b className="block text-warning">{entry.kind}</b>
                        )}
                        {entry.reason}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        label={"Session " + scope}
        page={page}
        total={entries.length}
        size={pageSize}
        onChange={setPage}
      />
    </div>
  );
}

export function SessionResults({
  result,
  labels,
}: {
  result: ComparedSession;
  labels: SideLabels;
}) {
  const [view, setView] = useState<"findings" | "transactions" | "events">(
    "findings",
  );
  const [selected, setSelected] = useState<{ side: Side; id: number }>();
  const inspect = (side: Side, id: number) => setSelected({ side, id });
  return (
    <section
      aria-label="Session comparison results"
      className="min-w-0 border-y border-border"
    >
      <p role="status" className="px-3 py-2 text-ui font-semibold">
        {countLabel(result.findings.length, "finding")} ·{" "}
        {countLabel(result.eventMatches.length, "matched event")} ·{" "}
        {countLabel(result.transactionMatches.length, "matched transaction")}
      </p>
      <div className="grid divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {sides.map((side) => (
          <SideSummary key={side} session={result[side]} label={labels[side]} />
        ))}
      </div>
      <p className="px-3 py-2 text-ui text-muted-foreground">
        Findings describe captured records. An absent record leaves the
        operation’s outcome unknown.
        {result.omittedFindings > 0 &&
          " " +
            result.omittedFindings +
            " additional findings exceeded the retained evidence limit."}
      </p>
      {result.parsingWarnings.length > 0 && (
        <details className="border-y border-border px-3 py-2 text-ui">
          <summary className="cursor-pointer text-warning">
            Session parsing warnings
          </summary>
          <ul className="mt-1">
            {result.parsingWarnings.map((warning, index) => (
              <li key={index}>
                {labels[warning.side]} · {warning.message}
                {warning.count ? " (" + warning.count + ")" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div
        role="group"
        aria-label="Session result view"
        className="flex flex-wrap border-b border-border px-3 pt-1"
      >
        {(
          [
            ["findings", "Findings"],
            ["transactions", "HTTP transactions"],
            ["events", "Events"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            className={viewButtonClass}
            onClick={() => {
              setView(key);
              setSelected(undefined);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "findings" ? (
        <Findings result={result} inspect={inspect} />
      ) : (
        <MatchTable key={view} result={result} scope={view} inspect={inspect} />
      )}
      {selected && (
        <EventDetails
          key={selected.side + selected.id}
          events={result[selected.side].events}
          id={selected.id}
          label={labels[selected.side]}
        />
      )}
    </section>
  );
}
