import { ComparisonError } from "./error";
import type { Differences } from "./differences";
import type { FieldPath, TextComparison, TextLine, TextRow } from "./model";

const maxLines = 60_000;
const maxAlignmentCells = 1_000_000;

type IndexedLine = TextLine & { key: number };

function splitLines(
  text: string,
  intern: (text: string, ending: string) => number,
): IndexedLine[] {
  const lines: IndexedLine[] = [];
  for (const match of text.matchAll(/([^\r\n]*)(\r\n|\r|\n|$)/g)) {
    if (!match[0]) continue;
    if (lines.length >= maxLines)
      throw new ComparisonError(
        "Text exceeds 60,000 lines. Compare a smaller excerpt.",
      );
    const value = match[1] ?? "";
    const ending = match[2] ?? "";
    lines.push({
      number: lines.length + 1,
      text: value,
      ending,
      key: intern(value, ending),
    });
  }
  return lines;
}

function lineValue(line: TextLine | undefined): TextLine | undefined {
  return line && { number: line.number, text: line.text, ending: line.ending };
}

export function compareText(
  diff: Differences,
  baseline: string,
  target: string,
  path: FieldPath,
): TextComparison {
  const keys = new Map<string, number>();
  const options = diff.config.text;
  function intern(text: string, ending: string) {
    const value = options?.normalizeWhitespace
      ? text.trim().replace(/\s+/g, " ")
      : text;
    const normalizedEnding =
      options?.normalizeLineEndings === false ? ending : ending ? "\n" : "";
    const key = value + normalizedEnding;
    let id = keys.get(key);
    if (id === undefined) {
      id = keys.size;
      keys.set(key, id);
    }
    return id;
  }
  const left = splitLines(baseline, intern);
  const right = splitLines(target, intern);
  const rows: TextRow[] = [];
  function add(a: IndexedLine | undefined, b: IndexedLine | undefined) {
    diff.step();
    const fieldPath = [...path, a?.number ?? b?.number ?? 1];
    const ignored = diff.rules.ignored(fieldPath);
    const changed = a?.key !== b?.key;
    const equivalent = !changed || (diff.config.mode === "structure" && a && b);
    const comparableEndings =
      a &&
      b &&
      (options?.normalizeLineEndings === false
        ? a.ending === b.ending
        : Boolean(a.ending) === Boolean(b.ending));
    const normalized =
      changed && comparableEndings && a && b
        ? diff.normalization(a.text, b.text, fieldPath)
        : undefined;
    const rule = ignored ?? normalized?.rule;
    const classification = equivalent
      ? "unchanged"
      : rule
        ? "ignored"
        : !a
          ? "added"
          : !b
            ? "removed"
            : "modified";
    rows.push({ baseline: lineValue(a), target: lineValue(b), classification });
    if (classification !== "unchanged" || diff.config.includeUnchanged) {
      diff.write({
        path: fieldPath,
        classification,
        baseline: a?.text,
        target: b?.text,
        baselineLocation: a && { line: a.number },
        targetLocation: b && { line: b.number },
        explanation: ignored
          ? "Excluded by the selected rule."
          : normalized?.explanation,
        rule,
      });
    }
  }
  function gap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
    const length = Math.max(aEnd - aStart, bEnd - bStart);
    for (let index = 0; index < length; index++)
      add(
        aStart + index < aEnd ? left[aStart + index] : undefined,
        bStart + index < bEnd ? right[bStart + index] : undefined,
      );
  }

  let start = 0;
  let aEnd = left.length;
  let bEnd = right.length;
  while (
    start < aEnd &&
    start < bEnd &&
    left[start]?.key === right[start]?.key
  ) {
    add(left[start], right[start]);
    start++;
  }
  while (
    aEnd > start &&
    bEnd > start &&
    left[aEnd - 1]?.key === right[bEnd - 1]?.key
  ) {
    aEnd--;
    bEnd--;
  }

  const height = aEnd - start;
  const width = bEnd - start;
  const exactAlignment =
    !height || !width || (height + 1) * (width + 1) <= maxAlignmentCells;
  if (!height || !width || !exactAlignment) {
    gap(start, aEnd, start, bEnd);
  } else {
    const stride = width + 1;
    const grid = new Uint32Array((height + 1) * stride);
    for (let a = height - 1; a >= 0; a--) {
      for (let b = width - 1; b >= 0; b--) {
        const cell = a * stride + b;
        grid[cell] =
          left[start + a]?.key === right[start + b]?.key
            ? 1 + (grid[cell + stride + 1] ?? 0)
            : Math.max(grid[cell + 1] ?? 0, grid[cell + stride] ?? 0);
      }
    }
    let a = 0;
    let b = 0;
    let aGap = start;
    let bGap = start;
    while (a < height && b < width) {
      if (left[start + a]?.key === right[start + b]?.key) {
        gap(aGap, start + a, bGap, start + b);
        add(left[start + a++], right[start + b++]);
        aGap = start + a;
        bGap = start + b;
      } else if (
        (grid[a * stride + b + 1] ?? 0) > (grid[(a + 1) * stride + b] ?? 0)
      )
        b++;
      else a++;
    }
    gap(aGap, aEnd, bGap, bEnd);
  }
  gap(aEnd, left.length, bEnd, right.length);
  if (!exactAlignment)
    diff.notices.push({
      kind: "text-alignment-limit",
      message:
        "The changed region exceeds the text alignment budget. Its lines are paired by position.",
    });
  return { rows, exactAlignment };
}

function patchLine(mark: string, line: TextLine) {
  return (
    mark +
    line.text +
    (line.ending === "\r\n" ? "\r\n" : "\n") +
    (line.ending ? "" : "\\ No newline at end of file\n")
  );
}

export function serializeUnifiedDiff(
  comparison: TextComparison,
  baselineLabel = "baseline",
  targetLabel = "target",
): string {
  const label = (value: string) => value.replace(/[\t\r\n]/g, " ");
  const rows = comparison.rows;
  if (
    !rows.some(
      (row) =>
        row.classification !== "unchanged" && row.classification !== "ignored",
    )
  )
    return "";
  const leftCount = rows.filter((row) => row.baseline).length;
  const rightCount = rows.filter((row) =>
    row.classification === "ignored" ? row.baseline : row.target,
  ).length;
  const output = [
    "--- " + label(baselineLabel) + "\n",
    "+++ " + label(targetLabel) + "\n",
    "@@ -" +
      (leftCount ? 1 : 0) +
      "," +
      leftCount +
      " +" +
      (rightCount ? 1 : 0) +
      "," +
      rightCount +
      " @@\n",
  ];
  for (let index = 0; index < rows.length;) {
    const row = rows[index];
    if (
      row?.classification === "unchanged" ||
      row?.classification === "ignored"
    ) {
      if (row.baseline) output.push(patchLine(" ", row.baseline));
      index++;
      continue;
    }
    const additions: string[] = [];
    while (index < rows.length) {
      const changed = rows[index];
      if (
        !changed ||
        changed.classification === "unchanged" ||
        changed.classification === "ignored"
      )
        break;
      if (changed.baseline) output.push(patchLine("-", changed.baseline));
      if (changed.target) additions.push(patchLine("+", changed.target));
      index++;
    }
    for (const addition of additions) output.push(addition);
  }
  return output.join("");
}
