import { ComparisonError } from "./error";
import { matchCandidates, matchGroups } from "./matching";
import type { Entry, Pair } from "./matching";
import type {
  ComparisonConfiguration,
  ComparisonNotice,
  ComparisonObject,
  ComparisonRule,
  ComparisonStatistics,
  ComparisonValue,
  Difference,
  FieldPath,
  MatchingWarning,
} from "./model";
import { Rules } from "./rules";
import type { Field } from "./rules";

export const MAX_RESULT_ROWS = 8_000;
const maxVisits = 600_000;
const maxFlexibleItems = 128;
const maxCandidates = 4_096;
const probeMismatch = Symbol();

function isArray(value: ComparisonValue): value is readonly ComparisonValue[] {
  return Array.isArray(value);
}

function valueType(value: ComparisonValue) {
  if (value === null) return "null";
  if (isArray(value)) return "array";
  return typeof value;
}

function identifier(value: ComparisonValue, keys: readonly string[]) {
  if (value === null || typeof value !== "object" || isArray(value)) return;
  const parts = keys.map((key) =>
    Object.hasOwn(value, key) ? value[key] : undefined,
  );
  if (
    !parts.every(
      (part) =>
        typeof part === "string" ||
        typeof part === "number" ||
        typeof part === "boolean",
    )
  )
    return;
  return JSON.stringify(parts);
}

const collapseWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

export class Differences {
  readonly rules: Rules;
  readonly statistics: ComparisonStatistics = {
    counts: {
      added: 0,
      removed: 0,
      modified: 0,
      "type-changed": 0,
      unchanged: 0,
      ignored: 0,
      reordered: 0,
      "missing-match": 0,
      "ambiguous-match": 0,
    },
    totalDifferences: 0,
    matchingWarnings: 0,
    omittedRows: 0,
  };
  readonly differences: Difference[] = [];
  readonly matchingWarnings: MatchingWarning[] = [];
  readonly notices: ComparisonNotice[] = [];
  private unchanged: Difference[] = [];
  private signatures = new Map<string, number>();
  private signatureCache = {
    exact: new WeakMap<object, number>(),
    unordered: new WeakMap<object, number>(),
    structure: new WeakMap<object, number>(),
  };
  private visits = 0;
  private probing = false;

  constructor(readonly config: ComparisonConfiguration) {
    this.rules = new Rules(config);
  }

  step() {
    if (++this.visits > maxVisits)
      throw new ComparisonError(
        "Comparison exceeds the work limit. Compare a smaller excerpt or simplify the matching rules.",
      );
  }

  write(difference: Difference) {
    const { classification } = difference;
    const changed =
      classification !== "unchanged" && classification !== "ignored";
    if (this.probing) {
      if (changed) throw probeMismatch;
      return;
    }
    this.statistics.counts[classification]++;
    if (changed) this.statistics.totalDifferences++;
    const rows =
      classification === "unchanged" ? this.unchanged : this.differences;
    if (rows.length < MAX_RESULT_ROWS) rows.push(difference);
  }

  warn(
    path: FieldPath,
    kind: MatchingWarning["kind"],
    message: string,
    side?: MatchingWarning["side"],
  ) {
    if (this.probing) throw probeMismatch;
    this.statistics.matchingWarnings++;
    if (this.matchingWarnings.length < MAX_RESULT_ROWS)
      this.matchingWarnings.push({ path, kind, message, side });
  }

  finish() {
    this.differences.push(
      ...this.unchanged.slice(0, MAX_RESULT_ROWS - this.differences.length),
    );
    this.unchanged = [];
    this.statistics.omittedRows =
      Object.values(this.statistics.counts).reduce(
        (sum, count) => sum + count,
        0,
      ) - this.differences.length;
    if (
      this.statistics.omittedRows ||
      this.statistics.matchingWarnings > this.matchingWarnings.length
    ) {
      this.notices.push({
        kind: "result-limit",
        message:
          "Counts include all results. Only the first 8,000 difference rows and 8,000 matching warnings are retained. Changed and ignored rows take priority over unchanged rows.",
      });
    }
  }

  compare(
    baseline: ComparisonValue | undefined,
    target: ComparisonValue | undefined,
    path: FieldPath,
    field?: Field,
    ordered = false,
  ) {
    this.step();
    const rule = this.rules.ignored(path, field);
    const context = { path, baseline, target };
    if (rule) {
      if (!this.equalExact(baseline, target))
        this.write({
          ...context,
          classification: "ignored",
          rule,
          explanation: "Excluded by the selected rule.",
        });
      return;
    }
    if (baseline === undefined || target === undefined) {
      if (baseline !== target)
        this.write({
          ...context,
          classification: baseline === undefined ? "added" : "removed",
        });
      return;
    }
    if (valueType(baseline) !== valueType(target)) {
      this.write({ ...context, classification: "type-changed" });
    } else if (isArray(baseline) && isArray(target)) {
      if (ordered) this.comparePositional(baseline, target, path);
      else this.compareArrays(baseline, target, path);
    } else if (
      baseline !== null &&
      target !== null &&
      typeof baseline === "object" &&
      typeof target === "object"
    ) {
      const left = baseline as ComparisonObject;
      const right = target as ComparisonObject;
      const names = new Set(
        [...Object.keys(left), ...Object.keys(right)].sort(),
      );
      if (!names.size && this.config.includeUnchanged)
        this.write({ ...context, classification: "unchanged" });
      for (const name of names)
        this.compare(
          Object.hasOwn(left, name) ? left[name] : undefined,
          Object.hasOwn(right, name) ? right[name] : undefined,
          [...path, name],
          { kind: "property", name },
        );
    } else if (baseline === target || this.config.mode === "structure") {
      if (this.config.includeUnchanged)
        this.write({ ...context, classification: "unchanged" });
    } else {
      const match = this.normalization(baseline, target, path);
      this.write(
        match
          ? { ...context, ...match, classification: "ignored" }
          : { ...context, classification: "modified" },
      );
    }
  }

  normalization(
    baseline: ComparisonValue,
    target: ComparisonValue,
    path: FieldPath,
  ): { rule: ComparisonRule; explanation: string } | undefined {
    if (typeof baseline === "number" && typeof target === "number") {
      const rule = this.rules.find("numeric-tolerance", path);
      if (rule && Math.abs(baseline - target) <= rule.absolute)
        return {
          rule,
          explanation: "The change is within the selected absolute tolerance.",
        };
    }
    if (typeof baseline !== "string" || typeof target !== "string") return;
    const whitespace = this.rules.find("ignore-whitespace", path);
    const casing = this.rules.find("ignore-case", path);
    const left = whitespace ? collapseWhitespace(baseline) : baseline;
    const right = whitespace ? collapseWhitespace(target) : target;
    if (whitespace && left === right)
      return {
        rule: whitespace,
        explanation:
          "The strings are equivalent after whitespace normalization.",
      };
    if (casing && left.toLowerCase() === right.toLowerCase())
      return {
        rule: casing,
        explanation: whitespace
          ? "The strings are equivalent after case and whitespace normalization."
          : "The strings are equivalent after case normalization.",
      };
  }

  equalExact(
    left: ComparisonValue | undefined,
    right: ComparisonValue | undefined,
  ) {
    if (left === right) return true;
    return (
      left !== undefined &&
      right !== undefined &&
      this.signature(left, "exact") === this.signature(right, "exact")
    );
  }

  private signature(
    value: ComparisonValue,
    mode: keyof Differences["signatureCache"],
  ): number {
    this.step();
    const object =
      value !== null && typeof value === "object" ? value : undefined;
    const cached = object && this.signatureCache[mode].get(object);
    if (cached !== undefined) return cached;
    let key: string;
    if (isArray(value)) {
      const items = value.map((item) => this.signature(item, mode));
      key = JSON.stringify([
        "array",
        mode === "structure"
          ? [...new Set(items)].sort()
          : mode === "unordered"
            ? items.sort()
            : items,
      ]);
    } else if (object) {
      const record = value as ComparisonObject;
      key = JSON.stringify([
        "object",
        Object.keys(record)
          .sort()
          .map((name) => [name, this.signature(record[name] ?? null, mode)]),
      ]);
    } else
      key = JSON.stringify([
        valueType(value),
        mode === "structure" ? null : value,
      ]);
    let id = this.signatures.get(key);
    if (id === undefined) {
      id = this.signatures.size;
      this.signatures.set(key, id);
    }
    if (object) this.signatureCache[mode].set(object, id);
    return id;
  }

  private compareArrays(
    baseline: readonly ComparisonValue[],
    target: readonly ComparisonValue[],
    path: FieldPath,
  ) {
    if (!baseline.length && !target.length) {
      if (this.config.includeUnchanged)
        this.write({ path, baseline, target, classification: "unchanged" });
      return;
    }
    const arrayRule = this.rules.find("array", path);
    const strategy = arrayRule?.strategy ??
      this.config.arrays ?? { kind: "positional" };
    if (this.config.mode === "structure") {
      const pairs = matchGroups(
        this.distinctShapes(baseline),
        this.distinctShapes(target),
        ({ value }) => String(this.signature(value, "structure")),
        false,
      );
      const unmatchedBaseline: Entry<ComparisonValue>[] = [];
      const unmatchedTarget: Entry<ComparisonValue>[] = [];
      for (const pair of pairs) {
        const a = pair.baseline?.value;
        const b = pair.target?.value;
        if (a && !b) unmatchedBaseline.push(a);
        if (b && !a) unmatchedTarget.push(b);
        if (a && b && this.config.includeUnchanged)
          this.compare(a.value, b.value, [...path, a.index]);
      }
      const length = Math.max(unmatchedBaseline.length, unmatchedTarget.length);
      for (let index = 0; index < length; index++) {
        const a = unmatchedBaseline[index];
        const b = unmatchedTarget[index];
        this.compare(a?.value, b?.value, [...path, a?.index ?? b?.index ?? 0]);
      }
    } else if (strategy.kind === "keyed") {
      const pairs = matchGroups(
        baseline,
        target,
        (value) => identifier(value, strategy.keys),
        true,
      );
      for (const pair of pairs) {
        const fieldPath = [
          ...path,
          pair.baseline?.index ?? pair.target?.index ?? 0,
        ];
        const rule = this.rules.ignored(fieldPath);
        if (pair.issue && !rule) {
          const kind =
            pair.issue === "missing-key" ? "missing-match" : "ambiguous-match";
          const message =
            pair.issue === "missing-key"
              ? "The record lacks one or more scalar identifier fields."
              : "The identifier occurs more than once on at least one side. No records were paired for it.";
          this.warn(
            fieldPath,
            kind,
            message,
            pair.baseline ? "baseline" : "target",
          );
          this.write({
            path: fieldPath,
            classification: kind,
            baseline: pair.baseline?.value,
            target: pair.target?.value,
            explanation: message,
            rule: arrayRule,
          });
        } else
          this.compare(pair.baseline?.value, pair.target?.value, fieldPath);
      }
    } else if (strategy.kind === "unordered") {
      for (const pair of this.unordered(baseline, target, path))
        this.compare(pair.baseline?.value, pair.target?.value, [
          ...path,
          pair.baseline?.index ?? pair.target?.index ?? 0,
        ]);
    } else this.comparePositional(baseline, target, path);
  }

  private comparePositional(
    baseline: readonly ComparisonValue[],
    target: readonly ComparisonValue[],
    path: FieldPath,
  ) {
    const length = Math.max(baseline.length, target.length);
    for (let index = 0; index < length; index++)
      this.compare(baseline[index], target[index], [...path, index]);
  }

  private distinctShapes(values: readonly ComparisonValue[]) {
    const shapes = new Map<number, Entry<ComparisonValue>>();
    values.forEach((value, index) => {
      const signature = this.signature(value, "structure");
      if (!shapes.has(signature)) shapes.set(signature, { value, index });
    });
    return [...shapes.values()];
  }

  private unordered(
    baseline: readonly ComparisonValue[],
    target: readonly ComparisonValue[],
    path: FieldPath,
  ): Pair<ComparisonValue>[] {
    const flexible =
      this.config.arrays?.kind === "keyed" ||
      this.rules.affectsUnorderedEquality(path);
    const mode =
      !flexible && this.config.arrays?.kind === "unordered"
        ? "unordered"
        : "exact";
    const exact = matchGroups(
      baseline,
      target,
      (value) => String(this.signature(value, mode)),
      false,
    );
    if (
      !flexible ||
      !baseline.length ||
      !target.length ||
      exact.every((pair) => pair.baseline && pair.target)
    )
      return exact;
    if (
      baseline.length > maxFlexibleItems ||
      target.length > maxFlexibleItems ||
      baseline.length * target.length > maxCandidates
    )
      throw new ComparisonError(
        "Rule-aware unordered matching exceeds the candidate limit. Use a keyed or positional strategy, narrow the rules, or compare fewer records.",
      );
    return matchCandidates(baseline, target, (left, right, index) => {
      const previous = this.probing;
      this.probing = true;
      try {
        this.compare(left, right, [...path, index]);
        return true;
      } catch (error) {
        if (error === probeMismatch) return false;
        throw error;
      } finally {
        this.probing = previous;
      }
    });
  }
}
