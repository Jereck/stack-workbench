import { useMemo, useState } from "react";
import { serializeUnifiedDiff } from "@stack-workbench/comparison-engine";
import type {
  DifferenceClassification,
  TextLine,
} from "@stack-workbench/comparison-engine";
import { CopyButton } from "@stack-workbench/ui/code-view";
import { EmptyState } from "@stack-workbench/ui/workspace";
import { Pagination } from "./pagination";
import {
  clip,
  describePath,
  differenceColors,
  differenceNames,
  preview,
} from "./result-model";
import type { Compared, ResultRow, SideLabels } from "./result-model";

const pageSize = 40;
type Cell = { location?: string | number; text: string };
interface AlignedRow {
  id: number;
  classification: DifferenceClassification;
  baseline?: Cell;
  target?: Cell;
}

function formattedRows(result: Compared, rows: ResultRow[]): AlignedRow[] {
  const values = result.text
    ? result.baseline.data.kind === "http"
      ? rows.filter(({ difference }) => difference.path[0] !== "body")
      : []
    : rows;
  const aligned: AlignedRow[] = values.map(({ id, path, difference }) => ({
    id,
    classification: difference.classification,
    baseline:
      difference.baseline === undefined
        ? undefined
        : {
            location: path,
            text: preview(difference.baseline, 420),
          },
    target:
      difference.target === undefined
        ? undefined
        : {
            location: difference.targetPath
              ? describePath(difference.targetPath)
              : path,
            text: preview(difference.target, 420),
          },
  }));
  const line = (entry: TextLine | undefined) =>
    entry && { location: entry.number, text: entry.text };
  for (const [index, entry] of result.text?.rows.entries() ?? []) {
    aligned.push({
      id: -index - 1,
      classification: entry.classification,
      baseline: line(entry.baseline),
      target: line(entry.target),
    });
  }
  return aligned;
}

function withContext(rows: AlignedRow[]) {
  const contextual: AlignedRow[] = [];
  let last = -1;
  rows.forEach((row, index) => {
    if (row.classification === "unchanged") return;
    for (
      let next = Math.max(last + 1, index - 2, 0);
      next <= Math.min(rows.length - 1, index + 2);
      next++
    ) {
      const entry = rows[next];
      if (entry) contextual.push(entry);
      last = next;
    }
  });
  return contextual.length ? contextual : rows;
}

function DiffCell({
  cell,
  kind,
  left,
}: {
  cell?: Cell;
  kind: DifferenceClassification;
  left?: boolean;
}) {
  const change = cell && kind !== "unchanged" && kind !== "ignored";
  return (
    <td
      className={
        "border-b border-border px-1.5 py-1.5 align-top sm:px-2 " +
        (left ? "border-r " : "") +
        (!cell
          ? "bg-background"
          : change
            ? left
              ? "bg-danger-soft"
              : "bg-accent-soft"
            : "")
      }
    >
      <div className="flex min-w-0 items-start gap-1 font-mono text-label sm:gap-2">
        <span
          className={
            "w-2.5 shrink-0 text-center sm:w-3 " +
            (left ? "text-danger" : "text-success")
          }
          aria-hidden
        >
          {change ? (left ? "−" : "+") : kind === "ignored" && cell ? "≈" : ""}
        </span>
        <div className="min-w-0 flex-1">
          {cell?.location !== undefined && (
            <span className="block text-muted-foreground wrap-anywhere">
              {clip(String(cell.location), 110)}
            </span>
          )}
          <span
            className={
              "block whitespace-pre-wrap wrap-anywhere " +
              (!cell ? "text-muted-foreground" : "")
            }
          >
            {cell
              ? clip(cell.text, 420) || (
                  <span className="text-muted-foreground">(empty line)</span>
                )
              : "Missing"}
          </span>
        </div>
      </div>
    </td>
  );
}

export function SideBySide({
  result,
  rows,
  labels,
}: {
  result: Compared;
  rows: ResultRow[];
  labels: SideLabels;
}) {
  const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const aligned = useMemo(() => formattedRows(result, rows), [result, rows]);
  const visible = useMemo(
    () => (all ? aligned : withContext(aligned)),
    [aligned, all],
  );
  const text = result.text;
  const hasTextChanges = text?.rows.some(
    ({ classification }) =>
      classification !== "unchanged" && classification !== "ignored",
  );
  return (
    <div className="min-w-0">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-1.5">
        <label className="flex min-h-7 items-center gap-1.5 text-ui">
          <input
            type="checkbox"
            checked={all}
            className="size-4 accent-accent"
            onChange={(event) => {
              setAll(event.target.checked);
              setPage(0);
            }}
          />
          Show all context
        </label>
        {text && hasTextChanges && (
          <CopyButton
            label={
              result.baseline.data.kind === "http"
                ? "Copy unified body diff"
                : "Copy unified diff"
            }
            text={() =>
              serializeUnifiedDiff(text, labels.baseline, labels.target)
            }
          />
        )}
      </div>
      {visible.length ? (
        <>
          <div
            role="region"
            aria-label="Synchronized comparison rows"
            tabIndex={0}
            className="max-h-[34rem] overflow-auto"
          >
            <table
              aria-label="Side-by-side differences"
              className="w-full min-w-[25rem] table-fixed border-separate border-spacing-0 text-ui"
            >
              <thead className="sticky top-0 z-10 bg-sidebar text-left text-label text-secondary">
                <tr>
                  <th
                    scope="col"
                    className="w-[39%] border-r border-b border-border px-3 py-2 wrap-anywhere"
                  >
                    {labels.baseline}
                  </th>
                  <th
                    scope="col"
                    className="w-[39%] border-b border-border px-3 py-2 wrap-anywhere"
                  >
                    {labels.target}
                  </th>
                  <th scope="col" className="border-b border-border px-2 py-2">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible
                  .slice(page * pageSize, (page + 1) * pageSize)
                  .map(({ id, classification, baseline, target }) => (
                    <tr key={id}>
                      <DiffCell cell={baseline} kind={classification} left />
                      <DiffCell cell={target} kind={classification} />
                      <td
                        className={
                          "border-b border-border px-2 py-2 align-top " +
                          differenceColors[classification]
                        }
                      >
                        {differenceNames[classification]}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination
            label="Side-by-side"
            page={page}
            size={pageSize}
            total={visible.length}
            onChange={setPage}
          />
        </>
      ) : (
        <EmptyState title="No aligned rows">
          Try comparing values or change the rules to include this content.
        </EmptyState>
      )}
    </div>
  );
}
