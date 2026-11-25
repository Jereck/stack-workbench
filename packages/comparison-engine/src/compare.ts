import { XmlParseError } from "@stack-workbench/payload-parser";
import { Differences } from "./differences";
import { ComparisonError } from "./error";
import { parseInput } from "./input";
import type {
  Baseline,
  ComparisonConfiguration,
  ComparisonResult,
  ComparisonValue,
  FieldPath,
  HttpMessage,
  InputData,
  ParsedInput,
  ParsingWarning,
  Target,
  TextComparison,
} from "./model";
import { compareText } from "./text-diff";
import { compareXml, xmlValue } from "./xml-diff";

function httpFields(message: HttpMessage) {
  const { kind, version, method, address, path, status } = message;
  return { kind, version, method, address, path, status };
}

export function inputValue(data: InputData): ComparisonValue {
  switch (data.kind) {
    case "json":
    case "log":
      return data.value;
    case "text":
      return data.text;
    case "xml":
    case "soap":
      return xmlValue(data.root);
    case "http": {
      const { message } = data;
      const fields: Record<string, ComparisonValue | undefined> = {
        ...httpFields(message),
        headers: message.headers,
        query: message.query,
        body: message.body && inputValue(message.body),
        recordedDurationMs: message.recordedDurationMs,
      };
      return Object.fromEntries(
        Object.entries(fields).filter(
          (entry): entry is [string, ComparisonValue] => entry[1] !== undefined,
        ),
      );
    }
  }
}

function compareHttp(
  diff: Differences,
  baseline: HttpMessage,
  target: HttpMessage,
): TextComparison | undefined {
  const left = httpFields(baseline);
  const right = httpFields(target);
  for (const name of [
    "kind",
    "version",
    "method",
    "address",
    "path",
    "status",
  ] as const)
    diff.compare(left[name], right[name], [name]);
  for (const [name, kind] of [
    ["headers", "http-header"],
    ["query", "query"],
  ] as const) {
    const a = baseline[name];
    const b = target[name];
    if (diff.rules.ignored([name])) {
      diff.compare(a, b, [name]);
      continue;
    }
    const names = new Set([...Object.keys(a), ...Object.keys(b)].sort());
    for (const field of names) {
      diff.compare(
        Object.hasOwn(a, field) ? a[field] : undefined,
        Object.hasOwn(b, field) ? b[field] : undefined,
        [name, field],
        { kind, name: field },
        true,
      );
    }
  }
  if (
    baseline.recordedDurationMs !== undefined &&
    target.recordedDurationMs !== undefined
  )
    diff.compare(baseline.recordedDurationMs, target.recordedDurationMs, [
      "recordedDurationMs",
    ]);
  const a = baseline.body;
  const b = target.body;
  if (a && b) return compareData(diff, a, b, ["body"]);
  diff.compare(a && inputValue(a), b && inputValue(b), ["body"]);
}

function compareData(
  diff: Differences,
  left: InputData,
  right: InputData,
  path: FieldPath,
): TextComparison | undefined {
  const rule = diff.rules.ignored(path);
  if (rule && (left.kind !== "json" || right.kind !== "json")) {
    const baseline = inputValue(left);
    const target = inputValue(right);
    if (left.kind !== right.kind || !diff.equalExact(baseline, target))
      diff.write({
        path,
        baseline,
        target,
        classification: "ignored",
        rule,
        explanation: "Excluded by the selected rule.",
      });
  } else if (
    (left.kind === "xml" || left.kind === "soap") &&
    (right.kind === "xml" || right.kind === "soap")
  ) {
    compareXml(diff, left.root, right.root, path);
  } else if (left.kind === "text" && right.kind === "text") {
    return compareText(diff, left.text, right.text, path);
  } else if (left.kind === "http" && right.kind === "http") {
    return compareHttp(diff, left.message, right.message);
  } else if (
    (left.kind === "json" && right.kind === "json") ||
    (left.kind === "log" && right.kind === "log")
  ) {
    diff.compare(left.value, right.value, path);
  } else {
    diff.notices.push({
      kind: "different-formats",
      message:
        "The detected or selected formats differ. Choose the same format on both sides to compare their contents with the same parser.",
    });
    diff.write({
      path,
      baseline: inputValue(left),
      target: inputValue(right),
      classification: "type-changed",
      explanation:
        "The input format changed from " +
        left.kind +
        " to " +
        right.kind +
        ".",
    });
  }
}

function errorDetails(error: unknown, fallback: string) {
  return error instanceof ComparisonError || error instanceof XmlParseError
    ? { message: error.message, location: error.location }
    : { message: fallback };
}

export function compareInputs(
  baseline: Baseline,
  target: Target,
  configuration: ComparisonConfiguration = {},
): ComparisonResult {
  const inputs = { baseline, target };
  const parsingWarnings: ParsingWarning[] = [];
  const errors: { side?: "baseline" | "target"; message: string }[] = [];
  const parsed: { baseline?: ParsedInput; target?: ParsedInput } = {};
  for (const side of ["baseline", "target"] as const) {
    try {
      const input = inputs[side];
      const { data, warnings } = parseInput(input, side, configuration);
      parsed[side] = { input, data };
      parsingWarnings.push(...warnings);
    } catch (error) {
      errors.push({
        side,
        ...errorDetails(
          error,
          "Unable to parse the input. Select its format or compare a smaller excerpt.",
        ),
      });
    }
  }
  if (!parsed.baseline || !parsed.target)
    return { status: "failed", inputs, ...parsed, parsingWarnings, errors };
  try {
    const diff = new Differences(configuration);
    const text = compareData(
      diff,
      parsed.baseline.data,
      parsed.target.data,
      [],
    );
    diff.finish();
    return {
      status: "compared",
      inputs,
      baseline: parsed.baseline,
      target: parsed.target,
      parsingWarnings,
      equivalent: diff.statistics.totalDifferences === 0,
      differences: diff.differences,
      statistics: diff.statistics,
      matchingWarnings: diff.matchingWarnings,
      notices: diff.notices,
      text,
    };
  } catch (error) {
    return {
      status: "failed",
      inputs,
      ...parsed,
      parsingWarnings,
      errors: [
        errorDetails(
          error,
          "Unable to compare the inputs. Compare a smaller excerpt or simplify the rules.",
        ),
      ],
    };
  }
}
