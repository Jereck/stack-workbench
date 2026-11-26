import {
  inputExceedsLimit,
  levels,
  parseLogs,
} from "@stack-workbench/log-parser";
import type { LogEvent, LogResult } from "@stack-workbench/log-parser";
import { compareInputs } from "./compare";
import type {
  ComparisonValue,
  Difference,
  InputFormat,
  ParsingWarning,
  Side,
} from "./model";
import { validateComparisonConfiguration } from "./rules";
import {
  eventKey,
  matchSessionRecords,
  payloadFor,
  prepareSession,
  transactionKey,
  validIdentifierPaths,
} from "./session-matching";
import type {
  MatchIssue,
  ObservedTransaction,
  SessionFinding,
  SessionMatch,
  SessionRequest,
  SessionResult,
} from "./session-model";

export const MAX_SESSION_FINDINGS = 8_000;
const payloadFormats = {
  JSON: "json",
  XML: "xml",
  SOAP: "soap",
  Text: "text",
} satisfies Record<LogEvent["payloads"][number]["kind"], InputFormat>;
type Finding = Omit<SessionFinding, "id">;

function scalarChange(
  path: string,
  baseline: ComparisonValue | undefined,
  target: ComparisonValue | undefined,
): Difference {
  return {
    path: [path],
    baseline,
    target,
    classification:
      baseline === undefined
        ? "added"
        : target === undefined
          ? "removed"
          : "modified",
  };
}

function compareTransactions(
  baseline: readonly ObservedTransaction[],
  target: readonly ObservedTransaction[],
  request: SessionRequest,
  issues: MatchIssue[],
) {
  const left = new Map(baseline.map((entry) => [entry.id, entry]));
  const right = new Map(target.map((entry) => [entry.id, entry]));
  const overrides: SessionMatch[] = [];
  const usedBaseline = new Set<number>();
  const usedTarget = new Set<number>();
  for (const pair of request.options?.overrides ?? []) {
    if (
      !left.has(pair.baseline) ||
      !right.has(pair.target) ||
      usedBaseline.has(pair.baseline) ||
      usedTarget.has(pair.target)
    ) {
      issues.push({
        scope: "transactions",
        kind: "override",
        baseline: [pair.baseline],
        target: [pair.target],
        reason:
          "A manual pair referred to an unavailable or already paired transaction.",
      });
      continue;
    }
    usedBaseline.add(pair.baseline);
    usedTarget.add(pair.target);
    overrides.push({ ...pair, reason: "Manual match" });
  }
  const settings = request.options?.matching ?? {};
  const matches = matchSessionRecords(
    baseline.filter(({ id }) => !usedBaseline.has(id)),
    target.filter(({ id }) => !usedTarget.has(id)),
    ({ id }) => id,
    (entry) => transactionKey(entry, settings),
    (entry) => transactionKey(entry, settings),
    "transactions",
    issues,
  );
  return {
    left,
    right,
    matches: [...overrides, ...matches].sort((a, b) => a.baseline - b.baseline),
  };
}

export function compareSessions(request: SessionRequest): SessionResult {
  const options = request.options ?? {};
  const configuration = options.comparison ?? {};
  const settings = options.matching ?? {};
  if (
    !validIdentifierPaths(settings.eventIdentifiers ?? []) ||
    !validIdentifierPaths(settings.payloadIdentifiers ?? [])
  )
    return {
      status: "failed",
      message:
        "Use up to eight unique exact JSON Pointers per identifier list.",
    };
  const configError = validateComparisonConfiguration(configuration);
  if (configError) return { status: "failed", message: configError };
  const issues: MatchIssue[] = [];
  const parsingWarnings: ParsingWarning[] = [];
  const parse = (side: Side) => {
    const input = request[side];
    if (inputExceedsLimit(input.text)) return;
    const logs: LogResult = parseLogs(input.text, input.logFormat);
    for (const [message, count] of Object.entries(logs.summary.warnings))
      parsingWarnings.push({ side, message, count });
    const group = options.groups?.[side];
    const events = group
      ? logs.events.filter((event) => event[group.field] === group.value)
      : logs.events;
    return prepareSession(logs, events, side, settings, issues);
  };
  const parsedBaseline = parse("baseline");
  const parsedTarget = parse("target");
  if (!parsedBaseline || !parsedTarget)
    return {
      status: "failed",
      message: "Use up to 4 MiB of UTF-8 logs per side.",
    };
  const baseline = parsedBaseline.snapshot;
  const target = parsedTarget.snapshot;
  if (options.groups && (!baseline.events.length || !target.events.length))
    return {
      status: "failed",
      message:
        "Select an available correlation group on each side, or clear group selection.",
    };

  const findings: SessionFinding[] = [];
  let omittedFindings = 0;
  function add(finding: Finding) {
    if (findings.length >= MAX_SESSION_FINDINGS) omittedFindings++;
    else findings.push({ id: findings.length + 1, ...finding });
  }
  for (const level of levels) {
    const before = baseline.summary.levels[level];
    const after = target.summary.levels[level];
    if (before !== after)
      add({
        kind: "severity",
        description:
          "Recorded " +
          level +
          " events changed from " +
          before +
          " to " +
          after +
          ".",
        difference: scalarChange(level, before, after),
      });
  }
  const baselineServices = new Set(baseline.services);
  const targetServices = new Set(target.services);
  const removedServices = baseline.services.filter(
    (name) => !targetServices.has(name),
  );
  const addedServices = target.services.filter(
    (name) => !baselineServices.has(name),
  );
  if (removedServices.length || addedServices.length)
    add({
      kind: "services",
      description: "Observed service participation changed.",
      difference: scalarChange("services", removedServices, addedServices),
    });

  const eventMatches = matchSessionRecords(
    baseline.events,
    target.events,
    ({ index }) => index,
    (event) => eventKey(event, parsedBaseline.info.get(event.index), settings),
    (event) => eventKey(event, parsedTarget.info.get(event.index), settings),
    "events",
    issues,
  );
  const transactions = compareTransactions(
    baseline.transactions,
    target.transactions,
    request,
    issues,
  );
  const events = {
    baseline: new Map(baseline.events.map((event) => [event.index, event])),
    target: new Map(target.events.map((event) => [event.index, event])),
  };
  const transactionEvents = {
    baseline: new Set(
      baseline.transactions.flatMap(({ events }) => [...events]),
    ),
    target: new Set(target.transactions.flatMap(({ events }) => [...events])),
  };
  const evidence = (left: readonly number[], right: readonly number[]) => ({
    baselineEvents: left,
    targetEvents: right,
  });

  function comparePayloads(
    a: LogEvent["payloads"],
    b: LogEvent["payloads"],
    role: "request" | "response" | "body",
    left: readonly number[],
    right: readonly number[],
    scope: MatchIssue["scope"],
    pair: SessionMatch,
  ) {
    const x = payloadFor(a, role);
    const y = payloadFor(b, role);
    const kind = role === "body" ? "payload" : role;
    if (x.ambiguous || y.ambiguous) {
      issues.push({
        kind: "payload",
        scope,
        baseline: [pair.baseline],
        target: [pair.target],
        reason:
          "Multiple captured " +
          role +
          " payloads compete for this comparison.",
      });
      return;
    }
    if (!x.payload || !y.payload) {
      if (x.payload || y.payload)
        add({
          kind,
          ...evidence(left, right),
          description:
            "A " +
            role +
            " payload was captured only in the " +
            (x.payload ? "baseline" : "target") +
            " logs.",
          difference: scalarChange(role, x.payload?.text, y.payload?.text),
        });
      return;
    }
    if (x.payload.kind === y.payload.kind && x.payload.text === y.payload.text)
      return;
    const result = compareInputs(
      { text: x.payload.text, format: payloadFormats[x.payload.kind] },
      { text: y.payload.text, format: payloadFormats[y.payload.kind] },
      { ...configuration, includeUnchanged: false },
    );
    if (result.status === "failed") {
      issues.push({
        kind: "payload",
        scope,
        baseline: [pair.baseline],
        target: [pair.target],
        reason:
          "A captured " +
          role +
          " payload could not be compared with the current settings.",
      });
      return;
    }
    parsingWarnings.push(...result.parsingWarnings);
    omittedFindings += result.statistics.omittedRows;
    for (const warning of result.matchingWarnings.slice(0, 1))
      issues.push({
        kind: "payload",
        scope,
        baseline: [pair.baseline],
        target: [pair.target],
        reason: warning.message,
      });
    for (const difference of result.differences)
      add({
        kind,
        ...evidence(left, right),
        difference,
        description:
          difference.classification === "ignored"
            ? "The " + role + " payload difference was ignored by a rule."
            : difference.classification === "type-changed"
              ? "A " + role + " payload type changed."
              : "A captured " + role + " payload changed.",
      });
  }

  for (const pair of transactions.matches) {
    const a = transactions.left.get(pair.baseline)!;
    const b = transactions.right.get(pair.target)!;
    const reference = evidence(a.events, b.events);
    if (a.status !== b.status)
      add({
        kind: "status",
        ...reference,
        difference: scalarChange("status", a.status, b.status),
        description:
          a.status !== undefined && b.status !== undefined
            ? "HTTP response changed from " + a.status + " to " + b.status + "."
            : "An HTTP status was recorded only in the " +
              (a.status !== undefined ? "baseline" : "target") +
              " logs.",
      });
    if ((a.responseEvent === undefined) !== (b.responseEvent === undefined))
      add({
        kind: "operation",
        ...reference,
        description:
          "A response record was observed only in the " +
          (a.responseEvent !== undefined ? "baseline" : "target") +
          " logs for this match.",
      });
    if (
      a.durationMs !== undefined &&
      b.durationMs !== undefined &&
      a.durationMs !== b.durationMs
    )
      add({
        kind: "duration",
        ...reference,
        difference: scalarChange("durationMs", a.durationMs, b.durationMs),
        description:
          "Recorded duration changed from " +
          a.durationMs +
          " ms to " +
          b.durationMs +
          " ms.",
      });
    if (a.operation !== b.operation)
      add({
        kind: "operation",
        ...reference,
        difference: scalarChange("operation", a.operation, b.operation),
        description:
          "Recorded operation metadata changed for this transaction.",
      });
    for (const role of ["request", "response"] as const)
      comparePayloads(
        a.payloads,
        b.payloads,
        role,
        a.events,
        b.events,
        "transactions",
        pair,
      );
  }

  let previous: SessionMatch | undefined;
  for (const pair of eventMatches) {
    const a = events.baseline.get(pair.baseline)!;
    const b = events.target.get(pair.target)!;
    const reference = evidence([a.index], [b.index]);
    if (
      a.exception?.message !== b.exception?.message ||
      a.exception?.type !== b.exception?.type ||
      Boolean(a.exception) !== Boolean(b.exception)
    )
      add({
        kind: "exception",
        ...reference,
        description: "Recorded exception details changed.",
        difference: scalarChange(
          "exception",
          a.exception && [
            a.exception.type ?? null,
            a.exception.message ?? null,
          ],
          b.exception && [
            b.exception.type ?? null,
            b.exception.message ?? null,
          ],
        ),
      });
    if (a.level !== b.level)
      add({
        kind: "severity",
        ...reference,
        difference: scalarChange("severity", a.level, b.level),
        description:
          "A matched event changed severity from " +
          a.level +
          " to " +
          b.level +
          ".",
      });
    if (previous && pair.target < previous.target)
      add({
        kind: "ordering",
        ...evidence(
          [previous.baseline, pair.baseline],
          [previous.target, pair.target],
        ),
        description: "The relative recorded order of matched events changed.",
      });
    previous = pair;
    if (
      !transactionEvents.baseline.has(a.index) &&
      !transactionEvents.target.has(b.index)
    ) {
      const beforeMs = parsedBaseline.info.get(a.index)?.durationMs;
      const afterMs = parsedTarget.info.get(b.index)?.durationMs;
      if (
        beforeMs !== undefined &&
        afterMs !== undefined &&
        beforeMs !== afterMs
      )
        add({
          kind: "duration",
          ...reference,
          difference: scalarChange("durationMs", beforeMs, afterMs),
          description:
            "Recorded duration changed from " +
            beforeMs +
            " ms to " +
            afterMs +
            " ms.",
        });
      comparePayloads(
        a.payloads,
        b.payloads,
        "body",
        [a.index],
        [b.index],
        "events",
        pair,
      );
    }
  }

  for (const issue of issues) {
    if (issue.kind !== "unmatched") continue;
    const index =
      issue.scope === "events"
        ? undefined
        : issue.baseline.length
          ? transactions.left
          : transactions.right;
    const related = (ids: readonly number[]) =>
      index ? ids.flatMap((id) => [...(index.get(id)?.events ?? [])]) : ids;
    const count = issue.baseline.length || issue.target.length;
    const noun = issue.scope === "events" ? "event" : "transaction";
    add({
      kind: issue.scope === "transactions" ? "operation" : "event",
      ...evidence(related(issue.baseline), related(issue.target)),
      description:
        count +
        " recorded " +
        noun +
        (count === 1 ? " has" : "s have") +
        " no corresponding match in the " +
        (issue.baseline.length ? "target" : "baseline") +
        " logs.",
    });
  }

  const observations = findings
    .filter(({ difference }) => difference?.classification !== "ignored")
    .slice(0, 50)
    .map(({ id, description }) => ({ evidence: [id], message: description }));
  return {
    status: "compared",
    baseline,
    target,
    eventMatches,
    transactionMatches: transactions.matches,
    issues,
    findings,
    observations,
    parsingWarnings,
    omittedFindings,
  };
}
