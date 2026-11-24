import { formats, levels } from "@stack-workbench/log-parser";
import type { LogResult, LogLevel } from "@stack-workbench/log-parser";

export const levelLabels: Record<LogLevel, string> = {
  trace: "Trace",
  debug: "Debug",
  info: "Info",
  warn: "Warn",
  error: "Error",
  fatal: "Fatal",
  unknown: "Unknown",
};

export const levelStyles: Record<LogLevel, string> = {
  trace: "text-muted-foreground",
  debug: "text-muted-foreground",
  info: "text-secondary",
  warn: "bg-warning-soft text-warning",
  error: "bg-danger-soft text-danger",
  fatal: "bg-danger-soft text-danger",
  unknown: "text-muted-foreground",
};

export function ResultSummary({ result }: { result: LogResult }) {
  const { summary } = result;
  const warningEntries = Object.entries(summary.warnings);
  const warningCount = warningEntries.reduce(
    (total, [, count]) => total + count,
    0,
  );
  const stats = [
    ["Events", result.events.length],
    ["Payloads", summary.payloads],
    ["Exceptions", summary.exceptions],
    ["Warnings", warningCount],
  ] as const;

  return (
    <section
      aria-labelledby="log-summary-title"
      className="border-b border-border bg-sidebar px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="log-summary-title" className="text-ui font-semibold">
          Results summary
        </h2>
        <dl className="flex flex-wrap gap-x-3 gap-y-1 text-label text-muted-foreground">
          {stats.map(([label, count]) => (
            <div
              key={label}
              className="flex flex-row-reverse items-baseline gap-1"
            >
              <dt>{label}</dt>
              <dd className="font-mono font-semibold text-foreground">
                {count.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-label text-muted-foreground sm:ml-auto">
          {formats[result.format]}
        </p>
      </div>
      <details className="mt-1 text-label">
        <summary className="w-fit cursor-pointer py-1 text-muted-foreground hover:text-foreground">
          Severity and timestamps
        </summary>
        <ul aria-label="Severity counts" className="mt-1 flex flex-wrap gap-2">
          {levels.map((level) => (
            <li
              key={level}
              className={
                "rounded-control px-1.5 py-0.5 font-mono " + levelStyles[level]
              }
            >
              {levelLabels[level]} {summary.levels[level]}
            </li>
          ))}
        </ul>
        {summary.earliest && summary.latest && (
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-muted-foreground">
            {(
              [
                ["Earliest", summary.earliest],
                ["Latest", summary.latest],
              ] as const
            ).map(([label, timestamp]) => (
              <div key={label} className="flex flex-wrap gap-x-2">
                <dt>{label}</dt>
                <dd className="font-mono">{timestamp.utc}</dd>
              </div>
            ))}
          </dl>
        )}
      </details>
      {warningCount > 0 && (
        <details className="mt-1 text-label">
          <summary className="w-fit cursor-pointer py-1 font-medium text-warning">
            Parsing warnings ({warningCount})
          </summary>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {warningEntries.map(([warning, count]) => (
              <li key={warning}>
                {warning} ({count})
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
