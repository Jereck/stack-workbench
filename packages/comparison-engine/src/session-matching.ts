import type { LogEvent, LogResult } from "@stack-workbench/log-parser";
import { groupCorrelations } from "@stack-workbench/log-parser";
import { isRecord, parseBoundedJson } from "@stack-workbench/payload-parser";
import type {
  MatchIssue,
  ObservedTransaction,
  SessionMatch,
  SessionSettings,
  SessionSide,
} from "./session-model";
import type { Side } from "./model";

type Scalar = boolean | string | number;
interface Metadata {
  operation?: string;
  template?: string;
  localId?: string;
  durationMs?: number;
  phase?: "request" | "response";
}

const field = (name: string) => name.toLowerCase().replace(/[-_.]/g, "");
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

function metadata(event: LogEvent): Metadata {
  const properties = event.properties ?? {};
  const root = new Map(
    Object.entries(properties).map(([key, value]) => [field(key), value]),
  );
  const nested = (value: unknown) =>
    isRecord(value)
      ? new Map(
          Object.entries(value).map(([key, entry]) => [field(key), entry]),
        )
      : new Map<string, unknown>();
  const http = nested(root.get("http"));
  const maps = [
    root,
    http,
    nested(root.get("response") ?? http.get("response")),
  ];
  const pick = (...names: string[]) => {
    for (const map of maps)
      for (const name of names) {
        const value = map.get(name);
        if (value !== undefined && value !== null) return value;
      }
  };
  const duration = pick(
    "durationms",
    "elapsedms",
    "elapsedmilliseconds",
    "durationmilliseconds",
  );
  const id = pick("transactionid", "httptransactionid");
  const phase = text(pick("httpphase", "phase", "eventtype"))?.toLowerCase();
  return {
    operation: text(
      pick("operation", "operationname", "actionname", "routename"),
    ),
    template: text(pick("@mt", "messagetemplate")),
    localId:
      text(id) ??
      (Number.isSafeInteger(id) ? String(id) : undefined) ??
      event.requestId,
    durationMs:
      typeof duration === "number" && Number.isFinite(duration) && duration >= 0
        ? duration
        : undefined,
    phase:
      phase === "request" || phase === "http-request"
        ? "request"
        : phase === "response" || phase === "http-response"
          ? "response"
          : undefined,
  };
}

function endpoint(url: string | undefined) {
  if (!url) return;
  const path =
    url
      .trim()
      .replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]+/i, "")
      .split(/[?#]/, 1)[0] ?? "";
  let end = path.length;
  while (end > 0 && path[end - 1] === "/") end--;
  return path.slice(0, end) || "/";
}

function scalar(value: unknown): value is Scalar {
  return (
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length > 0)
  );
}

function atPointer(value: unknown, path: string): unknown {
  let current = value;
  for (const token of path.slice(1).split("/")) {
    const segment = token.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(segment)) return;
      current = current[Number(segment)];
    } else {
      if (!isRecord(current) || !Object.hasOwn(current, segment)) return;
      current = current[segment];
    }
  }
  return current;
}

function identifiers(value: unknown, paths: readonly string[]) {
  const found = paths.map((path) => atPointer(value, path));
  return found.every(scalar) ? found : undefined;
}

export function validIdentifierPaths(paths: readonly string[]) {
  return (
    paths.length <= 8 &&
    new Set(paths).size === paths.length &&
    paths.every(
      (path) =>
        path.startsWith("/") && path.length <= 256 && !/~(?![01])/.test(path),
    )
  );
}

/** Prefer a single top-level capture; nested extracts stay available on the event. */
export function payloadFor(
  payloads: LogEvent["payloads"],
  role: "request" | "response" | "body",
) {
  const captured = payloads.filter((payload) =>
    role === "body"
      ? !payload.role || payload.role === "body"
      : payload.role === role,
  );
  const sources = new Map<string, LogEvent["payloads"][number]>();
  for (const entry of captured)
    sources.set(JSON.stringify([entry.kind, entry.text]), entry);
  const candidates = [...sources.values()].filter(
    (entry) =>
      !captured.some(
        (other) =>
          other.path !== entry.path &&
          (entry.path.startsWith(other.path + ".") ||
            entry.path.startsWith(other.path + "[")),
      ),
  );
  return {
    payload: candidates.length === 1 ? candidates[0] : undefined,
    ambiguous: candidates.length > 1,
  };
}

function addPayloadIdentifiers(
  transaction: ObservedTransaction,
  paths: readonly string[],
) {
  if (!paths.length) return;
  const request = payloadFor(transaction.payloads, "request");
  const captured =
    request.payload ??
    (request.ambiguous
      ? undefined
      : payloadFor(transaction.payloads, "response").payload);
  if (captured?.kind !== "JSON") return;
  try {
    transaction.identifiers = identifiers(
      parseBoundedJson(captured.text),
      paths,
    );
  } catch {
    // Unusable IDs become missing keys in the match results.
  }
}

interface Fragment extends ObservedTransaction {
  localId?: string;
}

function fragment(event: LogEvent, info: Metadata): Fragment | undefined {
  const method = event.httpMethod?.toUpperCase();
  const path = endpoint(event.httpUrl);
  const roles = new Set(event.payloads.map(({ role }) => role));
  const request =
    roles.has("request") ||
    info.phase === "request" ||
    /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)\s+\S+\s+HTTP\//i.test(
      event.message,
    );
  const response =
    roles.has("response") ||
    info.phase === "response" ||
    event.httpStatus !== undefined ||
    /^HTTP\//i.test(event.message);
  if (
    !method &&
    !path &&
    !info.phase &&
    !roles.has("request") &&
    !roles.has("response") &&
    !/^HTTP\//i.test(event.message)
  )
    return;
  return {
    id: event.index,
    events: [event.index],
    requestEvent:
      request || (method && path && !response) ? event.index : undefined,
    responseEvent: response ? event.index : undefined,
    method,
    endpoint: path,
    operation: info.operation,
    service: event.service,
    status: event.httpStatus,
    durationMs: info.durationMs,
    payloads: event.payloads,
    localId: info.localId,
  };
}

function compatible(a: Fragment, b: Fragment) {
  return (["method", "endpoint", "service"] as const).every(
    (key) => !a[key] || !b[key] || a[key] === b[key],
  );
}

function merged(a: Fragment, b: Fragment): ObservedTransaction {
  return {
    id: Math.min(a.id, b.id),
    events: [a.id, b.id].sort((a, b) => a - b),
    requestEvent: a.requestEvent,
    responseEvent: b.responseEvent,
    method: a.method ?? b.method,
    endpoint: a.endpoint ?? b.endpoint,
    service: a.service ?? b.service,
    operation: a.operation ?? b.operation,
    status: b.status,
    durationMs: b.durationMs ?? a.durationMs,
    payloads: [...a.payloads, ...b.payloads],
  };
}

export function prepareSession(
  logs: LogResult,
  events: readonly LogEvent[],
  side: Side,
  settings: SessionSettings,
  issues: MatchIssue[],
) {
  const info = new Map<number, Metadata>();
  const transactions: ObservedTransaction[] = [];
  const byId = new Map<string, Fragment[]>();
  const services = new Set<string>();
  for (const event of events) {
    const data = metadata(event);
    info.set(event.index, data);
    if (event.service) services.add(event.service);
    const candidate = fragment(event, data);
    if (!candidate) continue;
    if (
      candidate.localId &&
      (candidate.requestEvent === undefined ||
        candidate.responseEvent === undefined)
    ) {
      const group = byId.get(candidate.localId);
      if (group) group.push(candidate);
      else byId.set(candidate.localId, [candidate]);
    } else transactions.push(candidate);
  }
  for (const candidates of byId.values()) {
    const requests = candidates.filter(
      (candidate) => candidate.requestEvent !== undefined,
    );
    const responses = candidates.filter(
      (candidate) => candidate.responseEvent !== undefined,
    );
    const [a] = requests;
    const [b] = responses;
    if (candidates.length === 2 && a && b && compatible(a, b))
      transactions.push(merged(a, b));
    else {
      for (const candidate of candidates) transactions.push(candidate);
      if (a && b)
        issues.push({
          scope: "transactions",
          kind: "unlinked",
          baseline: side === "baseline" ? candidates.map(({ id }) => id) : [],
          target: side === "target" ? candidates.map(({ id }) => id) : [],
          reason:
            "The recorded request identifier does not identify one compatible request and response in this session.",
        });
    }
  }
  transactions.sort((a, b) => a.id - b.id);
  for (const entry of transactions)
    addPayloadIdentifiers(entry, settings.payloadIdentifiers ?? []);
  const levels = {
    trace: 0,
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0,
    unknown: 0,
  };
  let payloads = 0;
  let exceptions = 0;
  for (const event of events) {
    levels[event.level]++;
    payloads += event.payloads.length;
    exceptions += Number(Boolean(event.exception));
  }
  const snapshot: SessionSide = {
    format: logs.format,
    summary:
      events === logs.events
        ? logs.summary
        : {
            ...logs.summary,
            levels,
            payloads,
            exceptions,
            earliest: undefined,
            latest: undefined,
          },
    events,
    groups: groupCorrelations(logs.events),
    transactions,
    services: [...services].sort(),
  };
  return { snapshot, info };
}

interface Key {
  parts: readonly Scalar[];
  reason: string;
}

export function eventKey(
  event: LogEvent,
  info: Metadata | undefined,
  settings: SessionSettings,
): Key | undefined {
  const custom = settings.eventIdentifiers ?? [];
  const ids = custom.length ? identifiers(event.properties, custom) : [];
  if (!ids) return;
  const service =
    settings.includeService === false ? "" : (event.service ?? "");
  const candidate = info && fragment(event, info);
  const role = candidate
    ? [
        candidate.requestEvent !== undefined,
        candidate.responseEvent !== undefined,
      ].join("/")
    : "";
  if (ids.length)
    return {
      parts: ["fields", service, role, ...ids],
      reason: "Configured event identifiers",
    };
  if (candidate?.method && candidate.endpoint)
    return {
      parts: ["http", service, candidate.method, candidate.endpoint, role],
      reason: "Method, endpoint and recorded direction",
    };
  const value = info?.operation ?? info?.template ?? text(event.message);
  if (value)
    return {
      parts: [
        info?.operation ? "operation" : info?.template ? "template" : "message",
        service,
        value,
        role,
      ],
      reason: info?.operation
        ? "Recorded operation"
        : info?.template
          ? "Message template"
          : "Exact message",
    };
}

export function transactionKey(
  entry: ObservedTransaction,
  settings: SessionSettings,
): Key | undefined {
  if (settings.payloadIdentifiers?.length && !entry.identifiers) return;
  const service =
    settings.includeService === false ? "" : (entry.service ?? "");
  const ids = entry.identifiers ?? [];
  if (entry.method && entry.endpoint)
    return {
      parts: [
        "http",
        service,
        entry.method,
        entry.endpoint,
        settings.includeOperation ? (entry.operation ?? "") : "",
        ...ids,
      ],
      reason:
        "Method and normalized endpoint" +
        (settings.includeOperation ? ", with recorded operation" : "") +
        (ids.length ? ", with configured payload identifiers" : ""),
    };
  if (entry.operation)
    return {
      parts: ["operation", service, entry.operation, ...ids],
      reason: "Recorded operation",
    };
  if (ids.length)
    return {
      parts: ["fields", service, ...ids],
      reason: "Configured payload identifiers",
    };
}

export function matchSessionRecords<T>(
  baseline: readonly T[],
  target: readonly T[],
  id: (item: T) => number,
  leftKey: (item: T) => Key | undefined,
  rightKey: (item: T) => Key | undefined,
  scope: MatchIssue["scope"],
  issues: MatchIssue[],
): SessionMatch[] {
  const groups = new Map<
    string,
    { baseline: number[]; target: number[]; reason: string }
  >();
  function add(
    items: readonly T[],
    side: Side,
    read: (item: T) => Key | undefined,
  ) {
    const unset: number[] = [];
    for (const item of items) {
      const key = read(item);
      if (!key) {
        unset.push(id(item));
        continue;
      }
      const identity = JSON.stringify(key.parts);
      let entry = groups.get(identity);
      if (!entry) {
        entry = { baseline: [], target: [], reason: key.reason };
        groups.set(identity, entry);
      }
      entry[side].push(id(item));
    }
    if (unset.length)
      issues.push({
        scope,
        kind: "missing-key",
        baseline: side === "baseline" ? unset : [],
        target: side === "target" ? unset : [],
        reason: "A usable matching key was absent from these records.",
      });
  }
  add(baseline, "baseline", leftKey);
  add(target, "target", rightKey);
  const matches: SessionMatch[] = [];
  for (const group of groups.values()) {
    const [a] = group.baseline;
    const [b] = group.target;
    if (
      group.baseline.length === 1 &&
      group.target.length === 1 &&
      a !== undefined &&
      b !== undefined
    )
      matches.push({ baseline: a, target: b, reason: group.reason });
    else {
      const ambiguous = a !== undefined && b !== undefined;
      issues.push({
        ...group,
        scope,
        kind: ambiguous ? "ambiguous" : "unmatched",
        reason: ambiguous
          ? group.reason + " identified multiple candidates."
          : "No corresponding recorded key was found.",
      });
    }
  }
  return matches.sort((a, b) => a.baseline - b.baseline);
}
