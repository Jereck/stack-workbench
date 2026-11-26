import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { formatFieldPath } from "@stack-workbench/comparison-engine";
import type {
  Difference,
  DifferenceClassification,
  ComparisonValue,
  FieldPath,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import { CodeView, CopyButton } from "@stack-workbench/ui/code-view";
import { controlClass, EmptyState } from "@stack-workbench/ui/workspace";
import { Pagination } from "./pagination";
import {
  clip,
  describePath,
  differenceColors,
  differenceNames,
  preview,
} from "./result-model";
import type { ResultRow, SideLabels } from "./result-model";
import { describeRule } from "./rule-editor";

const pageSize = 24;

function rowSearch({ path, difference }: ResultRow) {
  const value = (entry: ComparisonValue | undefined) =>
    typeof entry === "string" ? clip(entry, 1024) : preview(entry);
  return [
    path,
    difference.targetPath && describePath(difference.targetPath),
    differenceNames[difference.classification],
    value(difference.baseline),
    value(difference.target),
    difference.rule && describeRule(difference.rule),
    difference.explanation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function ValueDetail({
  label,
  value,
  location,
}: {
  label: string;
  value: ComparisonValue | undefined;
  location?: Difference["baselineLocation"];
}) {
  return (
    <div className="min-w-0">
      {location && (
        <p className="mb-1 text-label text-muted-foreground">
          Line {location.line}
          {location.column ? ", column " + location.column : ""}
        </p>
      )}
      {value === undefined ? (
        <p className="text-ui text-muted-foreground">{label} is missing.</p>
      ) : (
        <CodeView
          label={label}
          text={
            typeof value === "string" && value !== ""
              ? value
              : JSON.stringify(value)
          }
          language={typeof value === "string" && value !== "" ? "Text" : "JSON"}
          copyText={typeof value === "string" ? value : undefined}
        />
      )}
    </div>
  );
}

interface RowActions {
  selected: number | undefined;
  collapsed: ReadonlySet<string>;
  onInspect: (row: ResultRow, button: HTMLButtonElement) => void;
  onToggle: (key: string) => void;
}

function DifferenceRow({
  row,
  actions,
}: {
  row: ResultRow;
  actions: RowActions;
}) {
  const { classification, baseline, target, rule } = row.difference;
  return (
    <tr
      className={
        actions.selected === row.id
          ? "bg-accent-soft"
          : "hover:bg-surface-muted"
      }
    >
      <th
        scope="row"
        className="border-b border-border p-1.5 text-left align-top font-normal"
      >
        <button
          type="button"
          aria-label={"Inspect " + clip(row.path)}
          aria-pressed={actions.selected === row.id}
          className="inline-block max-w-full rounded-control px-1 py-0.5 text-left font-mono text-label text-accent wrap-anywhere hover:underline"
          onClick={(event) => actions.onInspect(row, event.currentTarget)}
        >
          {clip(row.path)}
        </button>
      </th>
      <td
        className={
          "border-b border-border px-2 py-2 align-top font-medium " +
          differenceColors[classification]
        }
      >
        {differenceNames[classification]}
      </td>
      <td className="border-b border-border px-2 py-2 align-top font-mono text-label wrap-anywhere">
        {preview(baseline)}
      </td>
      <td className="border-b border-border px-2 py-2 align-top font-mono text-label wrap-anywhere">
        {preview(target)}
      </td>
      <td className="border-b border-border px-2 py-2 align-top text-muted-foreground wrap-anywhere">
        {rule ? clip(describeRule(rule), 110) : "—"}
      </td>
    </tr>
  );
}

function DifferenceRows({
  rows,
  depth = 0,
  actions,
}: {
  rows: ResultRow[];
  depth?: number;
  actions: RowActions;
}) {
  const groups = new Map<string | number, ResultRow[]>();
  const rowsAtPath: ResultRow[] = [];
  for (const row of rows) {
    const segment = row.difference.path[depth];
    if (segment === undefined) rowsAtPath.push(row);
    else {
      const group = groups.get(segment);
      if (group) group.push(row);
      else groups.set(segment, [row]);
    }
  }
  return (
    <>
      {rowsAtPath.map((row) => (
        <DifferenceRow key={"row-" + row.id} row={row} actions={actions} />
      ))}
      {[...groups.values()].map((group) => {
        const first = group[0]!;
        if (group.length === 1)
          return (
            <DifferenceRow
              key={"row-" + first.id}
              row={first}
              actions={actions}
            />
          );
        let end = depth + 1;
        const firstPath = first.difference.path;
        while (
          end < firstPath.length &&
          group.every(
            ({ difference }) => difference.path[end] === firstPath[end],
          )
        )
          end++;
        const prefix = firstPath.slice(0, end);
        const key = JSON.stringify(prefix);
        const open = !actions.collapsed.has(key);
        return (
          <GroupRows
            key={key}
            group={group}
            label={describePath(prefix)}
            level={end}
            open={open}
            actions={actions}
            onToggle={() => actions.onToggle(key)}
          />
        );
      })}
    </>
  );
}

function GroupRows({
  group,
  label,
  level,
  open,
  actions,
  onToggle,
}: {
  group: ResultRow[];
  label: string;
  level: number;
  open: boolean;
  actions: RowActions;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="bg-background">
        <td colSpan={5} className="border-b border-border px-2 py-0.5">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex min-h-7 max-w-full items-center gap-1.5 rounded-control px-1 text-left text-label text-secondary hover:bg-surface-muted"
          >
            {open ? (
              <ChevronDown size={14} aria-hidden className="shrink-0" />
            ) : (
              <ChevronRight size={14} aria-hidden className="shrink-0" />
            )}
            <span className="font-mono wrap-anywhere">{clip(label)}</span>
            <span className="shrink-0 text-muted-foreground">
              · {group.length} rows
            </span>
          </button>
        </td>
      </tr>
      {open && <DifferenceRows rows={group} depth={level} actions={actions} />}
    </>
  );
}

function DifferenceDetails({
  row,
  labels,
  panel,
  onIgnore,
  onClose,
}: {
  row: ResultRow;
  labels: SideLabels;
  panel: RefObject<HTMLElement | null>;
  onIgnore?: (path: FieldPath) => void;
  onClose: () => void;
}) {
  const diff = row.difference;
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Selected difference"
      className="min-w-0 space-y-3 border-t border-border bg-surface px-3 py-2 xl:border-t-0 xl:border-l"
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3
            className={
              "text-ui font-semibold " + differenceColors[diff.classification]
            }
          >
            {differenceNames[diff.classification]}
          </h3>
          <p className="mt-1 font-mono text-label wrap-anywhere">
            {clip(row.path, 500)}
          </p>
          {diff.targetPath && (
            <p className="mt-1 text-label text-muted-foreground wrap-anywhere">
              {labels.target} path{" "}
              <code>{clip(describePath(diff.targetPath), 500)}</code>
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close difference details"
          title="Close difference details"
          onClick={onClose}
        >
          <X size={15} aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton label="Copy field path" text={formatFieldPath(diff.path)} />
        {diff.targetPath && (
          <CopyButton
            label="Copy target path"
            text={formatFieldPath(diff.targetPath)}
          />
        )}
        {onIgnore &&
          diff.classification !== "ignored" &&
          diff.classification !== "unchanged" && (
            <Button
              variant="outline"
              className="min-h-7 px-2 py-1 text-label"
              onClick={() => onIgnore(diff.path)}
            >
              Ignore this path
            </Button>
          )}
      </div>
      {(diff.explanation || diff.rule) && (
        <div className="space-y-1 border-l-2 border-accent pl-2 text-ui text-secondary wrap-anywhere">
          {diff.rule && <p>{describeRule(diff.rule)}</p>}
          {diff.explanation && <p>{diff.explanation}</p>}
        </div>
      )}
      <ValueDetail
        label="Baseline value"
        value={diff.baseline}
        location={diff.baselineLocation}
      />
      <ValueDetail
        label="Target value"
        value={diff.target}
        location={diff.targetLocation}
      />
    </section>
  );
}

export function DifferenceExplorer({
  rows,
  labels,
  showIgnored,
  setShowIgnored,
  initialSelection,
  onIgnore,
}: {
  rows: ResultRow[];
  labels: SideLabels;
  showIgnored: boolean;
  setShowIgnored: (show: boolean) => void;
  initialSelection?: number;
  onIgnore?: (path: FieldPath) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DifferenceClassification | "all">("all");
  const [changesOnly, setChangesOnly] = useState(true);
  const [active, setActive] = useState(initialSelection);
  const [page, setPage] = useState<number>();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const detail = useRef<HTMLElement>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const needle = useDeferredValue(query.trim().toLowerCase());
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const type = row.difference.classification;
        return (
          (!changesOnly || type !== "unchanged") &&
          (showIgnored || type !== "ignored") &&
          (kind === "all" || type === kind) &&
          (!needle || rowSearch(row).includes(needle))
        );
      }),
    [rows, changesOnly, showIgnored, kind, needle],
  );
  const activeIndex = visible.findIndex(({ id }) => id === active);
  const selected = visible[activeIndex];
  const current = Math.min(
    Math.max(0, Math.ceil(visible.length / pageSize) - 1),
    page ?? Math.max(0, Math.floor(activeIndex / pageSize)),
  );
  const part = visible.slice(current * pageSize, (current + 1) * pageSize);
  const changed = visible.filter(
    ({ difference }) => difference.classification !== "unchanged",
  );
  const changedIndex = changed.findIndex(({ id }) => id === active);
  function choose(row: ResultRow) {
    setActive(row.id);
    setPage(Math.floor(visible.indexOf(row) / pageSize));
  }
  function move(offset: number) {
    const row =
      changed[
        changedIndex < 0 && offset < 0
          ? changed.length - 1
          : changedIndex + offset
      ];
    if (!row) return;
    setCollapsed(new Set());
    choose(row);
  }
  const actions: RowActions = {
    selected: active,
    collapsed,
    onInspect: (row, button) => {
      origin.current = button;
      choose(row);
      if (window.matchMedia("(max-width: 1279px)").matches)
        requestAnimationFrame(() => detail.current?.focus());
    },
    onToggle: (key) =>
      setCollapsed((previous) => {
        const next = new Set(previous);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
  };
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
        <label className="relative min-w-32 flex-1 sm:max-w-64">
          <Search
            size={14}
            className="pointer-events-none absolute top-2.5 left-2.5 text-muted-foreground"
            aria-hidden
          />
          <span className="sr-only">Search differences</span>
          <input
            ref={search}
            type="search"
            className={controlClass + " pl-8"}
            value={query}
            placeholder="Search paths or values…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Difference type"
          className={controlClass + " w-auto! max-w-full"}
          value={kind}
          onChange={(event) => {
            const classification = event.target.value as typeof kind;
            setKind(classification);
            setPage(0);
            if (classification === "unchanged") setChangesOnly(false);
            if (classification === "ignored") setShowIgnored(true);
          }}
        >
          <option value="all">All types</option>
          {Object.entries(differenceNames).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex min-h-8 items-center gap-1.5 text-ui">
          <input
            type="checkbox"
            checked={changesOnly}
            className="size-4 accent-accent"
            onChange={(event) => {
              setChangesOnly(event.target.checked);
              if (event.target.checked && kind === "unchanged") setKind("all");
              setPage(0);
            }}
          />{" "}
          Differences only
        </label>
        <label className="flex min-h-8 items-center gap-1.5 text-ui">
          <input
            type="checkbox"
            checked={showIgnored}
            className="size-4 accent-accent"
            onChange={(event) => {
              setShowIgnored(event.target.checked);
              if (!event.target.checked && kind === "ignored") setKind("all");
              setPage(0);
            }}
          />{" "}
          Show ignored
        </label>
        <div
          role="group"
          aria-label="Navigate differences"
          className="ml-auto flex items-center gap-1"
        >
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous difference"
            title="Previous difference"
            disabled={!changed.length || changedIndex === 0}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={16} aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next difference"
            title="Next difference"
            disabled={!changed.length || changedIndex === changed.length - 1}
            onClick={() => move(1)}
          >
            <ChevronRight size={16} aria-hidden />
          </Button>
        </div>
      </div>
      <div
        className={
          "min-w-0 " +
          (selected
            ? "grid xl:grid-cols-[minmax(0,1.9fr)_minmax(17rem,1fr)]"
            : "")
        }
      >
        <div className="min-w-0">
          {visible.length ? (
            <>
              <div
                role="region"
                aria-label="Scrollable difference list"
                tabIndex={0}
                className="max-h-[32rem] overflow-auto"
              >
                <table
                  aria-label="Differences"
                  className="w-full min-w-[36rem] table-fixed border-separate border-spacing-0 text-ui"
                >
                  <thead className="sticky top-0 z-10 bg-sidebar text-left text-label text-secondary">
                    <tr>
                      <th
                        scope="col"
                        className="w-[26%] border-b border-border px-2 py-2"
                      >
                        Field path
                      </th>
                      <th
                        scope="col"
                        className="w-[18%] border-b border-border px-2 py-2"
                      >
                        Type
                      </th>
                      <th
                        scope="col"
                        className="w-[18%] border-b border-border px-2 py-2 wrap-anywhere"
                      >
                        {labels.baseline}
                      </th>
                      <th
                        scope="col"
                        className="w-[18%] border-b border-border px-2 py-2 wrap-anywhere"
                      >
                        {labels.target}
                      </th>
                      <th
                        scope="col"
                        className="border-b border-border px-2 py-2"
                      >
                        Rule
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <DifferenceRows rows={part} actions={actions} />
                  </tbody>
                </table>
              </div>
              <Pagination
                label="Differences"
                page={current}
                size={pageSize}
                total={visible.length}
                onChange={(next) => {
                  setPage(next);
                  setActive(undefined);
                  setCollapsed(new Set());
                }}
              />
            </>
          ) : (
            <EmptyState title="No differences to display">
              Change the filters or view unchanged and ignored rows.
            </EmptyState>
          )}
        </div>
        {selected && (
          <DifferenceDetails
            key={selected.id}
            row={selected}
            labels={labels}
            panel={detail}
            onIgnore={onIgnore}
            onClose={() => {
              setActive(undefined);
              if (origin.current?.isConnected) origin.current.focus();
              else search.current?.focus();
            }}
          />
        )}
      </div>
    </div>
  );
}
