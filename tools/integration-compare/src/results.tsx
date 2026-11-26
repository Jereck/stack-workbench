import { useMemo, useRef, useState } from "react";
import type {
  ComparisonConfiguration,
  FieldPath,
} from "@stack-workbench/comparison-engine";
import { viewButtonClass } from "@stack-workbench/ui/workspace";
import { DifferenceExplorer } from "./difference-explorer";
import { clip, describePath, resultRows } from "./result-model";
import type { Compared, ResultRow, SideLabels } from "./result-model";
import { SideBySide } from "./side-by-side";
import { pairReport } from "./report";
import { ReportPanel } from "./report-panel";
import { StructureView } from "./structure-view";

const views = {
  differences: "Differences",
  paired: "Side by side",
  structure: "Structure",
} as const;
type View = keyof typeof views;
const preferenceKey = "stack-workbench-compare-view";

function savedView(): View {
  try {
    const saved = localStorage.getItem(preferenceKey);
    if (saved === "paired" || saved === "structure") return saved;
  } catch {
    // Comparison works with preference storage disabled.
  }
  return "differences";
}

function ResultSummary({
  result,
  structure,
}: {
  result: Compared;
  structure: boolean;
}) {
  const { counts, totalDifferences, matchingWarnings } = result.statistics;
  const totals = [
    ["Added", counts.added, "text-success"],
    ["Removed", counts.removed, "text-danger"],
    ["Modified", counts.modified, "text-accent"],
    ["Type changes", counts["type-changed"], "text-warning"],
    ["Reordered", counts.reordered, "text-accent"],
    ["Ignored", counts.ignored, "text-secondary"],
    ["Matching warnings", matchingWarnings, "text-warning"],
  ] as const;
  return (
    <div className="space-y-2 border-b border-border px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p
          role="status"
          className={
            "text-sm font-semibold " +
            (result.equivalent ? "text-success" : "text-foreground")
          }
        >
          {result.equivalent
            ? "Equivalent under current rules"
            : totalDifferences.toLocaleString("en-US") +
              (totalDifferences === 1 ? " difference" : " differences")}
        </p>
        {structure && (
          <span className="text-label text-muted-foreground">
            Observed structure
          </span>
        )}
      </div>
      <dl
        aria-label="Comparison counts"
        className="flex flex-wrap gap-x-4 gap-y-1 text-ui"
      >
        {totals.map(
          ([label, count, color]) =>
            (label !== "Reordered" || count > 0) && (
              <div key={label} className="flex items-baseline gap-1.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd
                  className={
                    "font-mono tabular-nums " +
                    (count ? color : "text-secondary")
                  }
                >
                  {count.toLocaleString("en-US")}
                </dd>
              </div>
            ),
        )}
      </dl>
      {result.notices.length > 0 && (
        <ul
          className="space-y-1 text-label text-warning"
          aria-label="Comparison notices"
        >
          {result.notices.map(({ kind, message }) => (
            <li key={kind}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Warnings({
  result,
  labels,
}: {
  result: Compared;
  labels: SideLabels;
}) {
  const warnings =
    result.parsingWarnings.length + result.statistics.matchingWarnings;
  if (!warnings) return null;
  return (
    <details className="border-b border-border px-3 text-ui sm:px-4">
      <summary className="cursor-pointer py-2 font-medium text-warning">
        Parsing and matching warnings
      </summary>
      <ul className="space-y-1 pb-2 text-label text-secondary">
        {result.parsingWarnings
          .slice(0, 20)
          .map(({ side, message, location, count }, index) => (
            <li key={index}>
              {labels[side]}
              {location ? " · Line " + location.line : ""} · {message}
              {count && count > 1 ? " (" + count + " occurrences)" : ""}
            </li>
          ))}
        {result.matchingWarnings
          .slice(0, 20)
          .map(({ side, message, path }, index) => (
            <li key={"match-" + index} className="wrap-anywhere">
              {side ? labels[side] + " · " : ""}
              <code>{clip(describePath(path))}</code>
              {" · " + message}
            </li>
          ))}
        {result.parsingWarnings.length > 20 && (
          <li>Showing the first 20 parsing warnings.</li>
        )}
        {result.statistics.matchingWarnings > 20 && (
          <li>
            Showing the first 20 matching warnings. Filter the difference
            explorer to review retained match findings.
          </li>
        )}
      </ul>
    </details>
  );
}

export function ComparisonResults({
  result,
  configuration,
  date,
  labels,
  showIgnored,
  setShowIgnored,
  onIgnore,
}: {
  result: Compared;
  configuration: ComparisonConfiguration;
  date: string;
  labels: SideLabels;
  showIgnored: boolean;
  setShowIgnored: (show: boolean) => void;
  onIgnore?: (path: FieldPath) => void;
}) {
  const [view, setView] = useState(savedView);
  const [initialSelection, setInitialSelection] = useState<number>();
  const root = useRef<HTMLElement>(null);
  const rows = useMemo(() => resultRows(result), [result]);
  function choose(next: View) {
    if (next === view) return;
    setInitialSelection(undefined);
    setView(next);
    try {
      localStorage.setItem(preferenceKey, next);
    } catch {
      // The selected view still applies to the active workspace.
    }
  }
  function inspect(row: ResultRow) {
    if (row.difference.classification === "ignored") setShowIgnored(true);
    setInitialSelection(row.id);
    setView("differences");
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLElement>('[aria-label="Selected difference"]')
        ?.focus(),
    );
  }
  return (
    <section
      ref={root}
      aria-label="Comparison results"
      className="min-w-0 border-y border-border bg-surface"
    >
      <ResultSummary
        result={result}
        structure={configuration.mode === "structure"}
      />
      <Warnings result={result} labels={labels} />
      <ReportPanel
        report={() => pairReport(result, labels, configuration, date)}
      />
      <div
        role="group"
        aria-label="Comparison view"
        className="flex flex-wrap gap-x-1 border-b border-border px-3 pt-1"
      >
        {(Object.keys(views) as View[]).map((item) => (
          <button
            key={item}
            type="button"
            className={viewButtonClass}
            aria-pressed={view === item}
            onClick={() => choose(item)}
          >
            {views[item]}
          </button>
        ))}
      </div>
      {view === "differences" && (
        <DifferenceExplorer
          rows={rows}
          labels={labels}
          showIgnored={showIgnored}
          setShowIgnored={setShowIgnored}
          initialSelection={initialSelection}
          onIgnore={onIgnore}
        />
      )}
      {view === "paired" && (
        <SideBySide result={result} rows={rows} labels={labels} />
      )}
      {view === "structure" && (
        <StructureView
          result={result}
          rows={rows}
          labels={labels}
          soapBody={configuration.xml?.soapScope === "body"}
          inspect={inspect}
        />
      )}
    </section>
  );
}
