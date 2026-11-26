import { formatFieldPath } from "@stack-workbench/comparison-engine";
import type {
  ComparisonObject,
  ComparisonResult,
  ComparisonValue,
  Difference,
  DifferenceClassification,
  FieldPath,
  Side,
} from "@stack-workbench/comparison-engine";

export type Compared = Extract<ComparisonResult, { status: "compared" }>;
export type SideLabels = Record<Side, string>;
export interface ResultRow {
  id: number;
  difference: Difference;
  path: string;
}

export const differenceNames = {
  added: "Added",
  removed: "Removed",
  modified: "Modified",
  "type-changed": "Type changed",
  unchanged: "Unchanged",
  ignored: "Ignored",
  reordered: "Reordered",
  "missing-match": "Missing match",
  "ambiguous-match": "Ambiguous match",
} satisfies Record<DifferenceClassification, string>;

export const differenceColors = {
  added: "text-success",
  removed: "text-danger",
  modified: "text-accent",
  "type-changed": "text-warning",
  unchanged: "text-muted-foreground",
  ignored: "text-muted-foreground",
  reordered: "text-accent",
  "missing-match": "text-warning",
  "ambiguous-match": "text-warning",
} satisfies Record<DifferenceClassification, string>;

export function clip(text: string, limit = 220) {
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

export function arrayValue(
  value: ComparisonValue,
): value is readonly ComparisonValue[] {
  return Array.isArray(value);
}

export function objectValue(value: ComparisonValue): value is ComparisonObject {
  return value !== null && typeof value === "object" && !arrayValue(value);
}

export function preview(
  value: ComparisonValue | undefined,
  limit = 160,
): string {
  if (value === undefined) return "Missing";
  if (arrayValue(value))
    return "[" + value.length + (value.length === 1 ? " item]" : " items]");
  if (objectValue(value)) {
    const keys: string[] = [];
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      if (keys.length === 3) return "{ " + keys.join(", ") + ", … }";
      keys.push(clip(JSON.stringify(clip(key, 32)), 36));
    }
    return keys.length ? "{ " + keys.join(", ") + " }" : "{}";
  }
  return typeof value === "string"
    ? clip(JSON.stringify(clip(value, limit)), limit)
    : String(value);
}

export function describePath(path: FieldPath) {
  return formatFieldPath(path) || "(root)";
}

export function pathOrder(left: FieldPath, right: FieldPath) {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (typeof a === "number" && typeof b === "number") return a - b;
    const first = String(a);
    const second = String(b);
    if (first === second) return typeof a === "number" ? -1 : 1;
    return first < second ? -1 : 1;
  }
  return left.length - right.length;
}

export function resultRows(result: Compared): ResultRow[] {
  return result.differences
    .map((difference, id) => ({
      id,
      difference,
      path: describePath(difference.path),
    }))
    .sort(
      (a, b) => pathOrder(a.difference.path, b.difference.path) || a.id - b.id,
    );
}
