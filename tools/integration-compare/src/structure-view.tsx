import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { xmlContent } from "@stack-workbench/comparison-engine";
import type {
  ComparisonValue,
  FieldPath,
  InputData,
  PayloadData,
  Side,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import {
  arrayValue,
  clip,
  differenceColors,
  differenceNames,
  objectValue,
  preview,
} from "./result-model";
import type { Compared, ResultRow, SideLabels } from "./result-model";

type XmlElement = Extract<PayloadData, { kind: "xml" | "soap" }>["root"];
type Http = Extract<InputData, { kind: "http" }>;
interface TreeNode {
  label: string;
  segment: FieldPath;
  value?: ComparisonValue;
  xml?: XmlElement;
  http?: Http["message"];
}

interface Mark {
  exact: ResultRow[];
  count: number;
  children: Map<string | number, Mark>;
}

const makeMark = (): Mark => ({ exact: [], count: 0, children: new Map() });

function marks(rows: ResultRow[], side: Side) {
  const root = makeMark();
  for (const row of rows) {
    const { difference } = row;
    if (
      difference.classification === "unchanged" ||
      difference[side] === undefined
    )
      continue;
    const path =
      side === "target"
        ? (difference.targetPath ?? difference.path)
        : difference.path;
    let mark = root;
    mark.count++;
    for (const part of path) {
      let child = mark.children.get(part);
      if (!child) {
        child = makeMark();
        mark.children.set(part, child);
      }
      mark = child;
      mark.count++;
    }
    mark.exact.push(row);
  }
  return root;
}

function markAt(mark: Mark | undefined, segment: FieldPath) {
  return segment.reduce<Mark | undefined>(
    (value, part) => value?.children.get(part),
    mark,
  );
}

function rootOf(
  data: InputData,
  segment: FieldPath,
  label: string,
  bodyOnly: boolean,
): TreeNode {
  if ("root" in data) {
    const root = data.root;
    const body =
      bodyOnly && data.kind === "soap"
        ? root.content.find(
            (child): child is XmlElement =>
              "name" in child &&
              child.local === "Body" &&
              child.namespace === root.namespace,
          )
        : undefined;
    const element = body || root;
    return {
      label: "<" + element.local + ">",
      segment: [...segment, element.name],
      xml: element,
    };
  }
  if (data.kind === "http") return { label, segment, http: data.message };
  if (data.kind === "text") return { label, segment, value: data.text };
  return { label, segment, value: data.value };
}

function* childNodes(node: TreeNode, bodyOnly: boolean): Generator<TreeNode> {
  if (node.xml) {
    const xml = node.xml;
    if (Object.keys(xml.attributes).length)
      yield {
        label: "Attributes",
        segment: ["@attributes"],
        value: xml.attributes,
      };
    const seen = new Map<string, number>();
    for (const child of xmlContent(xml)) {
      const name = "name" in child ? child.name : "#text";
      const index = seen.get(name) ?? 0;
      seen.set(name, index + 1);
      const segment = [name, index];
      yield "name" in child
        ? {
            label: "<" + child.local + "> [" + index + "]",
            segment,
            xml: child,
          }
        : { label: "#text", segment, value: child.value };
    }
  } else if (node.http) {
    const { body, ...fields } = node.http;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) yield { label: key, segment: [key], value };
    }
    if (body) yield rootOf(body, ["body"], "body", bodyOnly);
  } else if (node.value !== undefined && arrayValue(node.value)) {
    for (const [index, value] of node.value.entries())
      yield { label: "[" + index + "]", segment: [index], value };
  } else if (node.value !== undefined && objectValue(node.value)) {
    for (const key in node.value)
      if (Object.hasOwn(node.value, key))
        yield { label: key || '""', segment: [key], value: node.value[key] };
  }
}

function TreeItem({
  node,
  mark,
  bodyOnly,
  initialOpen,
  inspect,
}: {
  node: TreeNode;
  mark: Mark | undefined;
  bodyOnly: boolean;
  initialOpen?: boolean;
  inspect: (row: ResultRow) => void;
}) {
  const [open, setOpen] = useState(Boolean(initialOpen));
  const [count, setCount] = useState(24);
  const expandable = node.xml
    ? Boolean(
        node.xml.content.length || Object.keys(node.xml.attributes).length,
      )
    : Boolean(
        node.http ||
        (node.value !== undefined &&
          (arrayValue(node.value) || objectValue(node.value))),
      );
  const children = useMemo(() => {
    const result: TreeNode[] = [];
    if (open)
      for (const child of childNodes(node, bodyOnly)) {
        result.push(child);
        if (result.length > count) break;
      }
    return result;
  }, [node, bodyOnly, open, count]);
  const hasMore = children.length > count;
  const exact = mark?.exact[0];
  const order = node.xml ? mark?.children.get("#order")?.exact[0] : undefined;
  const label = (
    <span className="font-mono text-label wrap-anywhere">
      {clip(node.label, 160)}
    </span>
  );
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-control px-1 py-0.5 hover:bg-surface-muted">
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex min-h-7 min-w-0 items-center gap-1.5 rounded-control text-left text-foreground"
          >
            {open ? (
              <ChevronDown size={14} aria-hidden className="shrink-0" />
            ) : (
              <ChevronRight size={14} aria-hidden className="shrink-0" />
            )}
            {label}
          </button>
        ) : (
          <span className="pl-5 text-foreground">{label}</span>
        )}
        {!expandable && node.value !== undefined && (
          <span className="font-mono text-label text-muted-foreground wrap-anywhere">
            {preview(node.value)}
          </span>
        )}
        {exact && (
          <button
            type="button"
            onClick={() => inspect(exact)}
            className={
              "min-h-7 rounded-control px-1 text-label font-semibold underline underline-offset-2 " +
              differenceColors[exact.difference.classification]
            }
            aria-label={"Inspect " + exact.path + " in differences"}
          >
            {differenceNames[exact.difference.classification]}
          </button>
        )}
        {order && (
          <button
            type="button"
            onClick={() => inspect(order)}
            className="min-h-7 rounded-control px-1 text-label text-accent underline"
          >
            Order changed
          </button>
        )}
        {!open && Boolean(mark?.count && mark.count > (exact ? 1 : 0)) && (
          <span className="text-label text-muted-foreground">
            {mark?.count} changes under this path
          </span>
        )}
      </div>
      {open && (
        <ul className="ml-2 min-w-0 border-l border-border pl-2">
          {children.slice(0, count).map((child) => (
            <TreeItem
              key={JSON.stringify(child.segment)}
              node={child}
              mark={markAt(mark, child.segment)}
              bodyOnly={bodyOnly}
              inspect={inspect}
            />
          ))}
          {!children.length && expandable && (
            <li className="py-1 font-mono text-label text-muted-foreground">
              {node.xml
                ? "Empty element"
                : node.value === undefined
                  ? "Empty"
                  : preview(node.value)}
            </li>
          )}
          {hasMore && (
            <li>
              <Button variant="ghost" onClick={() => setCount(count + 24)}>
                Show more children
              </Button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function StructureView({
  result,
  rows,
  labels,
  soapBody,
  inspect,
}: {
  result: Compared;
  rows: ResultRow[];
  labels: SideLabels;
  soapBody: boolean;
  inspect: (row: ResultRow) => void;
}) {
  const baseline = useMemo(() => marks(rows, "baseline"), [rows]);
  const target = useMemo(() => marks(rows, "target"), [rows]);
  const bothSoap =
    result.baseline.data.kind === "soap" && result.target.data.kind === "soap";
  const bothHttpSoap =
    result.baseline.data.kind === "http" &&
    result.target.data.kind === "http" &&
    result.baseline.data.message.body?.kind === "soap" &&
    result.target.data.message.body?.kind === "soap";
  const bodyOnly = soapBody && (bothSoap || bothHttpSoap);
  return (
    <div className="grid min-w-0 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
      {(["baseline", "target"] as const).map((side) => {
        const data = result[side].data;
        const root = rootOf(
          data,
          [],
          data.kind === "http" ? "HTTP message" : "Root",
          bodyOnly,
        );
        const mark = markAt(
          side === "baseline" ? baseline : target,
          root.segment,
        );
        return (
          <section
            key={side}
            aria-label={
              side === "baseline" ? "Baseline structure" : "Target structure"
            }
            className="min-w-0"
          >
            <h3 className="border-b border-border bg-sidebar px-3 py-2 text-ui font-medium wrap-anywhere">
              {labels[side]}
            </h3>
            {data.kind === "text" ? (
              <p className="px-3 py-3 text-ui text-muted-foreground">
                Plain text is available in the side-by-side view.
              </p>
            ) : (
              <ul className="max-h-[35rem] overflow-auto p-2">
                <TreeItem
                  node={root}
                  mark={mark}
                  bodyOnly={bodyOnly}
                  initialOpen
                  inspect={inspect}
                />
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
