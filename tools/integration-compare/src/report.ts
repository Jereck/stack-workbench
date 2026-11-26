import { formatFieldPath } from "@stack-workbench/comparison-engine";
import type {
  ComparisonConfiguration,
  ComparisonResult,
  ComparisonValue,
  Difference,
  RegressionObservation,
  SessionOptions,
  SessionResult,
} from "@stack-workbench/comparison-engine";
import { allRedactions, redact } from "@stack-workbench/redaction-engine";

export type ReportFormat = "markdown" | "json" | "csv" | "html";
export interface ReportOptions {
  format: ReportFormat;
  includeValues: boolean;
  redact: boolean;
}
type Labels = { baseline: string; target: string };
type Compared = Extract<ComparisonResult, { status: "compared" }>;
type ComparedSession = Extract<SessionResult, { status: "compared" }>;
interface ReportFinding {
  id: number;
  description?: string;
  evidence?: { baseline?: readonly number[]; target?: readonly number[] };
  difference?: Difference;
}
export interface ReportData {
  version: 1;
  workflow: "payload" | "session";
  date: string;
  labels: Labels;
  configuration: ComparisonConfiguration;
  session?: Pick<SessionOptions, "matching" | "overrides"> & {
    groupFields?: { baseline: string; target: string };
  };
  statistics: unknown;
  findings: readonly ReportFinding[];
  observations: readonly RegressionObservation[];
  parsingWarnings: readonly unknown[];
  matchingWarnings: readonly unknown[];
  limitations: readonly string[];
}

export function pairReport(
  result: Compared,
  labels: Labels,
  configuration: ComparisonConfiguration,
  date: string,
): ReportData {
  const findings = result.differences
    .filter(({ classification }) => classification !== "unchanged")
    .map((difference, index) => ({ id: index + 1, difference }));
  return {
    version: 1,
    workflow: "payload",
    date,
    labels,
    configuration,
    statistics: result.statistics,
    findings,
    parsingWarnings: result.parsingWarnings,
    matchingWarnings: result.matchingWarnings,
    observations: findings
      .filter(({ difference }) => difference.classification !== "ignored")
      .slice(0, 50)
      .map(({ id, difference }) => ({
        evidence: [id],
        message:
          "Recorded evidence was classified as " +
          difference.classification +
          ".",
      })),
    limitations: result.notices.map(({ message }) => message),
  };
}

export function sessionReport(
  result: ComparedSession,
  labels: Labels,
  options: SessionOptions,
  date: string,
): ReportData {
  const summaries = (["baseline", "target"] as const).map((side) => ({
    side,
    events: result[side].events.length,
    transactions: result[side].transactions.length,
    payloads: result[side].summary.payloads,
    exceptions: result[side].summary.exceptions,
    severity: result[side].summary.levels,
  }));
  return {
    version: 1,
    workflow: "session",
    date,
    labels,
    configuration: options.comparison ?? {},
    session: {
      matching: options.matching,
      groupFields: options.groups && {
        baseline: options.groups.baseline.field,
        target: options.groups.target.field,
      },
      overrides: options.overrides,
    },
    statistics: {
      sides: summaries,
      matchedEvents: result.eventMatches.length,
      matchedTransactions: result.transactionMatches.length,
      findings: result.findings.length,
      omittedFindings: result.omittedFindings,
      matchingWarnings: result.issues.length,
    },
    findings: result.findings.map(
      ({ id, description, difference, baselineEvents, targetEvents }) => ({
        id,
        description,
        difference,
        evidence: {
          baseline: baselineEvents?.map((n) => n + 1),
          target: targetEvents?.map((n) => n + 1),
        },
      }),
    ),
    observations: result.observations,
    parsingWarnings: result.parsingWarnings,
    matchingWarnings: result.issues,
    limitations: [
      "Session findings describe captured records. Missing evidence does not establish whether an operation executed.",
      "Automatic matches require one candidate per side. Inspect the warnings for ambiguous or unmatched records.",
      ...(result.omittedFindings
        ? ["Some findings exceeded the report evidence limit."]
        : []),
    ],
  };
}

const categories = new Set(allRedactions);

function safeValue(
  value: ComparisonValue | undefined,
  path: Difference["path"],
) {
  if (value === undefined) return;
  // Scalar differences can lose their sensitive field name when lifted out of a payload.
  for (const segment of path) {
    if (typeof segment !== "string") continue;
    const leaf = segment.slice(segment.lastIndexOf("}") + 1);
    const probe = redact({ name: leaf, value: "probe" }, categories) as {
      value: unknown;
    };
    if (probe.value === "[REDACTED]") return "[REDACTED]";
  }
  return redact(value, categories) as ComparisonValue;
}

function reportCopy(data: ReportData, options: ReportOptions): ReportData {
  const { findings, ...rest } = data;
  const metadata = options.redact
    ? (redact(rest, categories) as Omit<ReportData, "findings">)
    : rest;
  return {
    ...metadata,
    limitations: [
      ...metadata.limitations,
      options.includeValues
        ? "This report includes captured difference values."
        : "This report omits captured difference values.",
      ...(options.redact
        ? [
            "Best-effort masking was applied. Review this report for secrets before sharing.",
          ]
        : []),
    ],
    findings: findings.map(({ difference, ...finding }) => {
      const copy = options.redact
        ? (redact(finding, categories) as Omit<ReportFinding, "difference">)
        : finding;
      if (!difference) return copy;
      const { baseline, target, ...details } = difference;
      const masked = options.redact
        ? (redact(details, categories) as typeof details)
        : details;
      return {
        ...copy,
        difference: options.includeValues
          ? {
              ...masked,
              baseline: options.redact
                ? safeValue(baseline, details.path)
                : baseline,
              target: options.redact
                ? safeValue(target, details.targetPath ?? details.path)
                : target,
            }
          : masked,
      };
    }),
  };
}

const csvCell = (value: string) => {
  const guarded =
    /^[\r\n\t]/.test(value) || /^[\s\u0000-\u001f]*[=+@-]/.test(value)
      ? "'" + value
      : value;
  return '"' + guarded.replaceAll('"', '""') + '"';
};
const valueText = (value: unknown) =>
  value === undefined ? "" : JSON.stringify(value);
const html = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const md = (value: string) =>
  html(value)
    .replace(/[\\\x60*_[\]()!|~]/g, "\\$&")
    .replace(/[\r\n]+/g, " ");

export function serializeReport(
  data: ReportData,
  options: ReportOptions,
): { content: string; mime: string; extension: string } {
  const report = reportCopy(data, options);
  if (options.format === "json")
    return {
      content: JSON.stringify(report, null, 2) + "\n",
      mime: "application/json",
      extension: "json",
    };
  const metadata = [
    ["Comparison date", report.date],
    ["Workflow", report.workflow],
    ["Baseline", report.labels.baseline],
    ["Target", report.labels.target],
    ["Configuration", valueText(report.configuration)],
    ["Session matching", valueText(report.session)],
    ["Statistics", valueText(report.statistics)],
  ].filter((row) => row[1]);
  const notes = [
    [
      "Observations",
      report.observations.map(
        ({ message, evidence }) =>
          message + " Evidence #" + evidence.join(", #") + ".",
      ),
    ],
    ["Parsing warnings", report.parsingWarnings.map(valueText)],
    ["Matching warnings", report.matchingWarnings.map(valueText)],
    ["Limitations", report.limitations],
  ] as const;
  const headings = [
    "Evidence",
    "Path",
    "Type",
    "Baseline value",
    "Target value",
    "Details",
  ];
  const evidence = report.findings.map(
    ({ id, description, difference, evidence }) => [
      String(id),
      (difference && formatFieldPath(difference.path)) || "(root)",
      difference?.classification ?? "observation",
      valueText(difference?.baseline),
      valueText(difference?.target),
      [
        description,
        difference?.explanation,
        difference?.targetPath
          ? "Target path " + formatFieldPath(difference.targetPath)
          : "",
        difference?.rule ? "Rule " + valueText(difference.rule) : "",
        evidence ? "Log event numbers " + valueText(evidence) : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ],
  );
  if (options.format === "csv") {
    const rows = [
      ["Section", ...headings],
      ...metadata.map(([key, value]) => [
        "Metadata",
        "",
        key ?? "",
        "",
        "",
        "",
        value ?? "",
      ]),
      ...evidence.map((row) => ["Difference", ...row]),
      ...notes.flatMap(([section, entries]) =>
        entries.map((message) => [section, "", "", "", "", "", message]),
      ),
    ];
    return {
      content:
        rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n",
      mime: "text/csv",
      extension: "csv",
    };
  }
  if (options.format === "html") {
    const document = [
      '<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;"><title>Integration Compare report</title>',
      "<style>body{font:15px system-ui;max-width:75rem;margin:2rem auto;padding:1rem;color:#17181b}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #bbb;text-align:left;vertical-align:top;padding:.35rem;overflow-wrap:anywhere;white-space:pre-wrap}dd,li{overflow-wrap:anywhere}tr{break-inside:avoid}@media print{body{font-size:10pt;padding:0;margin:0}thead{display:table-header-group}}</style>",
      "<h1>Integration Compare report</h1><dl>",
      ...metadata.map(
        ([key, value]) =>
          "<dt><strong>" +
          html(key ?? "") +
          "</strong></dt><dd>" +
          html(value ?? "") +
          "</dd>",
      ),
      "</dl><h2>Evidence</h2><table><thead><tr>" +
        headings
          .map((cell) => '<th scope="col">' + html(cell) + "</th>")
          .join("") +
        "</tr></thead><tbody>",
      ...evidence.map(
        (row) =>
          "<tr>" +
          row.map((cell) => "<td>" + html(cell) + "</td>").join("") +
          "</tr>",
      ),
      "</tbody></table>",
      ...notes
        .filter(([, entries]) => entries.length)
        .map(
          ([heading, entries]) =>
            "<h2>" +
            html(heading) +
            "</h2><ul>" +
            entries.map((entry) => "<li>" + html(entry) + "</li>").join("") +
            "</ul>",
        ),
      "</html>",
    ];
    return {
      content: document.join("\n"),
      mime: "text/html",
      extension: "html",
    };
  }
  const table = (row: string[]) => "| " + row.map(md).join(" | ") + " |";
  return {
    extension: "md",
    mime: "text/markdown",
    content: [
      "# Integration Compare report",
      "",
      ...metadata.map(
        ([key, value]) => "- **" + md(key ?? "") + "** " + md(value ?? ""),
      ),
      "",
      "## Evidence",
      "",
      table(headings),
      table(headings.map(() => "---")),
      ...evidence.map(table),
      ...notes
        .filter(([, entries]) => entries.length)
        .flatMap(([heading, entries]) => [
          "",
          "## " + heading,
          "",
          ...entries.map((entry) => "- " + md(entry)),
        ]),
      "",
    ].join("\n"),
  };
}
