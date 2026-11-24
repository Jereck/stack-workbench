import {
  extractPayloads,
  isRecord,
  parseBoundedJson,
} from "@stack-workbench/payload-parser";
import { exceptionFromMessage, normalizeException } from "./exception";
import { MAX_RESULT_PAYLOAD_LENGTH } from "./model";
import type { LogEvent, LogLevel } from "./model";
import { readTimestamp } from "./timestamp";

const aliases = {
  trace: "trace",
  verbose: "trace",
  vrb: "trace",
  trc: "trace",
  debug: "debug",
  dbg: "debug",
  info: "info",
  information: "info",
  inf: "info",
  warn: "warn",
  warning: "warn",
  wrn: "warn",
  error: "error",
  err: "error",
  fail: "error",
  fatal: "fatal",
  critical: "fatal",
  ftl: "fatal",
  crt: "fatal",
} satisfies Record<string, LogLevel>;
const levelMap = new Map<string, LogLevel>(Object.entries(aliases));
const timestampPrefix =
  /^\[?(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d{1,9})?(?:\s?(?:Z|[+-]\d\d:?\d\d))?)\]?(?=\s|$)\s*/i;
const levelPrefix = /^(?:\[([a-z]+)\]|([a-z]+)\b)\s*(?:[:|-]\s*)?/i;
const httpLine =
  /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)[ \t]+((?:https?:\/\/|\/)[^\s"<>]*)(?:[ \t]+(?:responded[ \t]+|HTTP\/[\d.]+[ \t]+)?([1-5]\d{2})\b)?/i;
const idPattern =
  /(?:^|[\s,;])(trace|span|correlation|request)[_.-]?id\s*[=:]\s*["']?([\w.:/-]{1,256})(?![\w.:/-])/gi;

type Fields = Map<string, unknown>;
type Defaults = { source?: string; timestamp?: unknown; cloudwatch?: boolean };
const fieldName = (name: string) => name.toLowerCase().replace(/[_\-.]/g, "");
const fieldsOf = (value: unknown): Fields =>
  new Map(
    isRecord(value)
      ? Object.entries(value).map(([key, field]) => [fieldName(key), field])
      : [],
  );

function pick(fields: Fields[], ...names: string[]): unknown {
  for (const map of fields) {
    for (const name of names) {
      const value = map.get(name);
      if (value !== undefined && value !== null) return value;
    }
  }
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function identifier(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : stringField(value);
}

function textFields(text: string) {
  const headerEnd = text.search(/[\r\n]/);
  const first = headerEnd === -1 ? text : text.slice(0, headerEnd);
  const timestamp = timestampPrefix.exec(first)?.[1];
  const withoutTimestamp = first.replace(timestampPrefix, "");
  const match = levelPrefix.exec(withoutTimestamp);
  const level = levelMap.get((match?.[1] ?? match?.[2] ?? "").toLowerCase());
  const prefix = level && match ? match[0].length : 0;
  return {
    timestamp,
    level,
    message:
      withoutTimestamp.slice(prefix) +
      (headerEnd === -1 ? "" : text.slice(headerEnd)),
  };
}

export function isSerilogText(line: string) {
  return (
    /^\[[a-z]+\]/i.test(line.replace(timestampPrefix, "")) &&
    timestampPrefix.test(line) &&
    Boolean(textFields(line).level)
  );
}

export function normalizeEvent(
  value: unknown,
  raw: string,
  index: number,
  warnings: string[],
  remainingPayload: number,
  defaults: Defaults = {},
): LogEvent {
  const parsedAsText = value === undefined;
  const text = parsedAsText
    ? raw.replace(/^\uFEFF|(?:\r\n|\r|\n)$/g, "").trimStart()
    : typeof value === "string"
      ? value
      : undefined;
  const outer = fieldsOf(value);
  const originalMessage = pick(
    [outer],
    "@m",
    "@message",
    "message",
    "msg",
    "log",
    "@mt",
    "messagetemplate",
  );
  const cloudMessage = defaults.cloudwatch
    ? stringField(originalMessage)
    : undefined;
  let nested: unknown;
  if (cloudMessage?.trimStart().startsWith("{")) {
    try {
      nested = parseBoundedJson(cloudMessage);
    } catch {
      warnings.push(
        "CloudWatch message contains malformed or unsupported JSON.",
      );
    }
  }
  const inner = fieldsOf(nested);
  const nestedProperties = pick([inner, outer], "properties", "attributes");
  const fields = [inner, outer, fieldsOf(nestedProperties)];
  const suppliedMessage = stringField(
    pick(
      fields,
      "@m",
      "@message",
      "message",
      "msg",
      "log",
      "@mt",
      "messagetemplate",
    ),
  );
  const sourceText = parsedAsText
    ? text
    : cloudMessage && !isRecord(nested)
      ? cloudMessage
      : undefined;
  const line = sourceText !== undefined ? textFields(sourceText) : undefined;
  const message =
    line?.message ??
    suppliedMessage ??
    text ??
    (isRecord(value) ? "" : JSON.stringify(value));
  const knownTime = pick(
    [inner],
    "@t",
    "@timestamp",
    "timestamp",
    "time",
    "datetime",
  );
  const outerTime = pick(
    [outer],
    "@t",
    "@timestamp",
    "timestamp",
    "time",
    "datetime",
  );
  const timestamp = readTimestamp(
    knownTime ??
      outerTime ??
      line?.timestamp ??
      defaults.timestamp ??
      pick([fields[2]!], "timestamp", "time"),
    Boolean(defaults.cloudwatch && knownTime === undefined),
  );
  if (timestamp && !timestamp.utc)
    warnings.push(
      "Timestamp could not be placed on the timeline. The original value is shown.",
    );
  const suppliedLevel = stringField(
    pick(fields, "@l", "level", "loglevel", "severity", "severitytext"),
  );
  const level = suppliedLevel
    ? levelMap.get(suppliedLevel.toLowerCase())
    : line?.level;
  // Serilog omits @l for its default Information level.
  const compactInfo = [inner, outer].some(
    (map) =>
      map.has("@t") && (map.has("@m") || map.has("@mt")) && !map.has("@l"),
  );
  const context = fieldsOf(pick(fields, "http"));
  const request = fieldsOf(
    pick([...fields, context], "request", "httprequest"),
  );
  const response = fieldsOf(
    pick([...fields, context], "response", "httpresponse"),
  );
  const firstLineEnd = message.search(/[\r\n]/);
  const singleLine =
    firstLineEnd === -1 ? message : message.slice(0, firstLineEnd);
  const http = httpLine.exec(singleLine);
  const status =
    pick(
      [...fields, context, response],
      "httpstatuscode",
      "httpstatus",
      "statuscode",
      "status",
    ) ??
    http?.[3] ??
    /^HTTP\/[\d.]+\s+([1-5]\d{2})\b/i.exec(singleLine)?.[1];
  const numericStatus =
    typeof status === "number" || typeof status === "string"
      ? Number(status)
      : NaN;
  const ids = new Map<string, string>();
  // Read IDs only from the log prefix rather than matching keys inside message payloads.
  const metadataPrefix = singleLine.split(/[{[<]/, 1)[0] ?? "";
  for (const match of metadataPrefix.matchAll(idPattern)) {
    if (match[1] && match[2]) ids.set(match[1].toLowerCase(), match[2]);
  }
  const exception =
    normalizeException(pick(fields, "@x", "exception", "error")) ??
    normalizeException(pick(fields, "stacktrace", "stack")) ??
    exceptionFromMessage(message);
  const properties =
    isRecord(value) || isRecord(nestedProperties)
      ? Object.fromEntries([
          ...(isRecord(nestedProperties)
            ? Object.entries(nestedProperties)
            : []),
          ...(isRecord(value)
            ? Object.entries(value).filter(
                ([key]) =>
                  !["properties", "attributes"].includes(fieldName(key)),
              )
            : []),
          ...(isRecord(nested) ? Object.entries(nested) : []),
        ])
      : undefined;
  const payloadProperties = properties
    ? Object.fromEntries(
        Object.entries(properties).filter(
          ([key]) =>
            ![
              "message",
              "msg",
              "log",
              "@m",
              "@message",
              "@x",
              "@mt",
              "messagetemplate",
              "exception",
              "stack",
              "stacktrace",
            ].includes(fieldName(key)),
        ),
      )
    : undefined;
  const extraction =
    remainingPayload > 0
      ? extractPayloads(
          [
            { name: "message", value: message },
            { name: "properties", value: payloadProperties },
          ],
          Math.min(remainingPayload, MAX_RESULT_PAYLOAD_LENGTH),
        )
      : {
          payloads: [],
          warnings: ["Payload extraction reached the workspace output limit."],
        };
  warnings.push(...extraction.warnings);
  return {
    index,
    raw,
    timestamp,
    warnings,
    level: level ?? (compactInfo && !suppliedLevel ? "info" : "unknown"),
    message,
    properties,
    exception,
    source:
      stringField(
        pick(
          fields,
          "source",
          "logstream",
          "@logstream",
          "loggroup",
          "@log",
          "loggername",
        ),
      ) ?? defaults.source,
    service: stringField(
      pick(fields, "servicename", "service", "application", "app"),
    ),
    logger: stringField(
      pick(fields, "logger", "category", "loggercategory", "sourcecontext"),
    ),
    traceId: identifier(pick(fields, "@tr", "traceid")) ?? ids.get("trace"),
    spanId: identifier(pick(fields, "@sp", "spanid")) ?? ids.get("span"),
    correlationId:
      identifier(pick(fields, "correlationid")) ?? ids.get("correlation"),
    requestId: identifier(pick(fields, "requestid")) ?? ids.get("request"),
    httpMethod:
      stringField(
        pick(
          [...fields, context, request],
          "httpmethod",
          "requestmethod",
          "method",
        ),
      ) ?? http?.[1],
    httpUrl:
      stringField(
        pick(
          [...fields, context, request],
          "httpurl",
          "requesturl",
          "requestpath",
          "url",
          "path",
        ),
      ) ?? http?.[2],
    httpStatus:
      Number.isInteger(numericStatus) &&
      numericStatus >= 100 &&
      numericStatus <= 599
        ? numericStatus
        : undefined,
    payloads: extraction.payloads,
  };
}
