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
  trace: "bg-surface-muted text-muted-foreground",
  debug: "bg-violet-500/12 text-[light-dark(#63369e,#d5b5ff)]",
  info: "bg-blue-500/12 text-[light-dark(#1b4ca1,#a6ccff)]",
  warn: "bg-amber-500/16 text-[light-dark(#754800,#ffcf81)]",
  error: "bg-rose-500/14 text-[light-dark(#9c2648,#ff9eb7)]",
  fatal: "bg-rose-500/23 text-[light-dark(#8e193b,#ff9eb7)]",
  unknown: "bg-surface-muted text-muted-foreground",
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
      className="rounded-xl border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="log-summary-title" className="font-semibold">
          Results summary
        </h2>
        <p className="text-sm text-muted-foreground">
          {formats[result.format]}
        </p>
      </div>
      <dl className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
        {stats.map(([label, count]) => (
          <div key={label} className="px-4 py-3 sm:px-5">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">
              {count.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      <div className="space-y-3 border-t border-border px-4 py-3 sm:px-5">
        <ul aria-label="Severity counts" className="flex flex-wrap gap-2">
          {levels.map((level) => (
            <li
              key={level}
              className={
                "rounded px-2 py-1 text-xs font-medium tabular-nums " +
                levelStyles[level]
              }
            >
              {levelLabels[level]} {summary.levels[level]}
            </li>
          ))}
        </ul>
        {summary.earliest && summary.latest && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
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
        {warningCount > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-accent">
              Parsing warnings ({warningCount})
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {warningEntries.map(([warning, count]) => (
                <li key={warning}>
                  {warning} ({count})
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
