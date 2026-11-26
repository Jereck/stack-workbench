import {
  isRecord,
  MAX_PAYLOAD_LENGTH,
  parseBoundedJson,
  readXml,
  scanJsonContainer,
} from "@stack-workbench/payload-parser";
import { isExceptionContinuation } from "./exception";
import {
  levels,
  MAX_EVENTS,
  MAX_INPUT_BYTES,
  MAX_RESULT_PAYLOAD_LENGTH,
} from "./model";
import type { LogEvent, LogFormat, LogResult } from "./model";
import { isSerilogText, normalizeEvent } from "./normalize";

const malformed = "Malformed or unsupported JSON was retained as raw text.";
const eventLimit =
  "The event limit was reached. Remaining records are available in this raw event.";
const isContainer = (text: string) =>
  /^\s*(?:{|\[\s*(?:[[{"\]\d-]|true\b|false\b|null\b|$))/.test(text);

function readJson(text: string): unknown {
  try {
    return parseBoundedJson(text);
  } catch {
    return undefined;
  }
}

function isCompact(value: unknown): boolean {
  return isRecord(value) && "@t" in value && ("@m" in value || "@mt" in value);
}

function isInsightsRow(
  value: unknown,
): value is { field: string; value: unknown }[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry: unknown) =>
        isRecord(entry) &&
        typeof entry.field === "string" &&
        Object.hasOwn(entry, "value"),
    )
  );
}

function isCloudEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    (("@timestamp" in value && "@message" in value) ||
      ("message" in value &&
        "timestamp" in value &&
        ("eventId" in value ||
          "ingestionTime" in value ||
          "logStreamName" in value)))
  );
}

function cloudArray(value: Record<string, unknown>) {
  for (const key of ["logEvents", "events", "results"]) {
    const list = value[key];
    if (!Array.isArray(list)) continue;
    if (
      key === "logEvents" ||
      (key === "results" && list.some(isInsightsRow)) ||
      (key === "events" &&
        ("logGroup" in value ||
          "logStream" in value ||
          list.some(isCloudEvent)))
    )
      return key;
  }
}

export function detectStructuredLogFormat(
  value: unknown,
): "cloudwatch" | "serilog-json" | "json" {
  if (isRecord(value) && cloudArray(value)) return "cloudwatch";
  const first: unknown = Array.isArray(value)
    ? value.find((entry: unknown) => entry !== null)
    : value;
  if (isCloudEvent(first) || isInsightsRow(first)) return "cloudwatch";
  return isCompact(first) ? "serilog-json" : "json";
}

function* lines(input: string) {
  for (const match of input.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    const raw = match[0];
    if (raw) yield { raw, offset: match.index };
  }
}

export function detectLogLineFormat(
  input: string,
): "serilog-json" | "cloudwatch" | "ndjson" | "serilog-text" | "text" {
  let inspected = 0;
  let jsonCount = 0;
  let compactCount = 0;
  let cloudCount = 0;
  let serilogCount = 0;
  for (const { raw } of lines(input)) {
    if (!raw.trim()) continue;
    if (++inspected > 32) break;
    if (isContainer(raw)) {
      const value = readJson(raw);
      if (value !== undefined) jsonCount++;
      if (isCompact(value)) compactCount++;
      if (isCloudEvent(value)) cloudCount++;
    }
    if (isSerilogText(raw.trimStart())) serilogCount++;
  }
  if (
    compactCount > 0 &&
    compactCount === jsonCount &&
    compactCount >= inspected / 2
  )
    return "serilog-json";
  if (cloudCount > 0 && cloudCount === jsonCount && cloudCount >= inspected / 2)
    return "cloudwatch";
  if (jsonCount > 0 && jsonCount >= inspected / 2) return "ndjson";
  if (serilogCount > 0) return "serilog-text";
  return "text";
}

function skipWhitespace(input: string, start: number) {
  while (/\s/.test(input[start] ?? "") && start < input.length) start++;
  return start;
}

// The enclosing document was validated already. Walk its value boundaries to retain
// original whitespace, punctuation and numeric spelling inside each event.
function valueEnd(input: string, start: number): number {
  const first = input[start];
  if (first === "{" || first === "[")
    return scanJsonContainer(input, start).end ?? input.length;
  if (first === '"') {
    let index = start + 1;
    while (index < input.length) {
      if (input[index] === "\\") index += 2;
      else if (input[index++] === '"') return index;
    }
  }
  let index = start;
  while (index < input.length && !/[\s,}\]]/.test(input[index] ?? "")) index++;
  return index;
}

function findArray(
  input: string,
  key: string,
  start: number,
): number | undefined {
  let found: number | undefined;
  let index = skipWhitespace(input, start + 1);
  while (input[index] === '"') {
    const keyEnd = valueEnd(input, index);
    const next = skipWhitespace(input, skipWhitespace(input, keyEnd) + 1);
    if (readJson(input.slice(index, keyEnd)) === key) found = next;
    index = skipWhitespace(input, valueEnd(input, next));
    if (input[index] !== ",") break;
    index = skipWhitespace(input, index + 1);
  }
  return found;
}

function multilinePayloadEnd(
  input: string,
  line: string,
  offset: number,
): number {
  const lineEnd = offset + line.length;
  if (lineEnd === input.length || line.length >= MAX_PAYLOAD_LENGTH) return 0;
  let attempts = 0;
  for (const opening of line.matchAll(/[{[]|<(?=[a-z!?])/gi)) {
    if (++attempts > 8) break;
    const start = offset + opening.index;
    const limit = Math.min(input.length, start + MAX_PAYLOAD_LENGTH);
    if (opening[0] === "<") {
      const xml = readXml(input.slice(start, limit));
      if (xml && start + xml.end > lineEnd) return start + xml.end;
    } else if (isContainer(line.slice(opening.index))) {
      const { end } = scanJsonContainer(input, start, limit);
      if (
        end &&
        end > lineEnd &&
        readJson(input.slice(start, end)) !== undefined
      )
        return end;
    }
  }
  return 0;
}

function summarize(events: LogEvent[]): LogResult["summary"] {
  const counts = {
    trace: 0,
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0,
    unknown: 0,
  } satisfies Record<(typeof levels)[number], number>;
  const summary: LogResult["summary"] = {
    levels: counts,
    payloads: 0,
    exceptions: 0,
    warnings: {},
  };
  for (const event of events) {
    counts[event.level]++;
    summary.payloads += event.payloads.length;
    if (event.exception) summary.exceptions++;
    for (const warning of event.warnings)
      summary.warnings[warning] = (summary.warnings[warning] ?? 0) + 1;
    if (event.timestamp?.utc) {
      if (!summary.earliest?.utc || event.timestamp.utc < summary.earliest.utc)
        summary.earliest = event.timestamp;
      if (!summary.latest?.utc || event.timestamp.utc > summary.latest.utc)
        summary.latest = event.timestamp;
    }
  }
  return summary;
}

export function inputExceedsLimit(input: string) {
  return (
    input.length > MAX_INPUT_BYTES ||
    (input.length > MAX_INPUT_BYTES / 3 &&
      new TextEncoder().encode(input).byteLength > MAX_INPUT_BYTES)
  );
}

export class InputLimitError extends Error {}

export function parseLogs(
  input: string,
  override: LogFormat = "auto",
): LogResult {
  if (inputExceedsLimit(input))
    throw new InputLimitError("Input exceeds the 4 MiB limit.");
  const events: LogEvent[] = [];
  const allowWhole =
    override !== "text" && override !== "serilog-text" && override !== "ndjson";
  const whole =
    allowWhole && (isContainer(input) || override === "json")
      ? readJson(input)
      : undefined;
  const format =
    override === "auto"
      ? whole === undefined
        ? detectLogLineFormat(input)
        : detectStructuredLogFormat(whole)
      : override;
  let payloadRemaining = MAX_RESULT_PAYLOAD_LENGTH;

  function append(
    value: unknown,
    raw: string,
    warnings: string[] = [],
    source?: string,
    cloudwatch = format === "cloudwatch" || isCloudEvent(value),
  ) {
    const structured =
      cloudwatch && isInsightsRow(value)
        ? Object.fromEntries(value.map(({ field, value }) => [field, value]))
        : value;
    const event = normalizeEvent(
      structured,
      raw,
      events.length,
      warnings,
      payloadRemaining,
      { source, cloudwatch },
    );
    for (const payload of event.payloads)
      payloadRemaining -= payload.text.length + (payload.original?.length ?? 0);
    events.push(event);
  }

  function overflow(raw: string) {
    events.push({
      index: events.length,
      raw,
      message: "",
      level: "unknown",
      payloads: [],
      warnings: [eventLimit],
    });
  }

  const start = skipWhitespace(input, 0);
  const cloudKey =
    format === "cloudwatch" && isRecord(whole) ? cloudArray(whole) : undefined;
  const records: unknown =
    cloudKey && isRecord(whole) ? whole[cloudKey] : whole;
  if (Array.isArray(records)) {
    const arrayStart = cloudKey ? findArray(input, cloudKey, start) : start;
    if (arrayStart !== undefined) {
      let offset = skipWhitespace(input, arrayStart + 1);
      const source = isRecord(whole)
        ? [
            whole.logStream,
            whole.logGroup,
            whole.logStreamName,
            whole.logGroupName,
          ].find((value) => typeof value === "string")
        : undefined;
      for (let index = 0; index < records.length; index++) {
        if (index === MAX_EVENTS - 1 && records.length > MAX_EVENTS) {
          const end = scanJsonContainer(input, arrayStart).end ?? input.length;
          overflow(input.slice(offset, end - 1));
          break;
        }
        const end = valueEnd(input, offset);
        append(
          records[index],
          input.slice(offset, end),
          [],
          typeof source === "string" ? source : undefined,
        );
        offset = skipWhitespace(input, skipWhitespace(input, end) + 1);
      }
    }
  } else if (whole !== undefined) {
    append(whole, input);
  } else {
    const parseStructuredLines =
      override !== "text" && override !== "serilog-text";
    const expectedJson = format !== "text" && format !== "serilog-text";
    let pending:
      | {
          start: number;
          value: unknown;
          warnings: string[];
          body: boolean;
          exception: boolean;
          payloadEnd: number;
        }
      | undefined;
    let leading = 0;
    let finished = false;
    for (const { raw, offset } of lines(input)) {
      const trimmed = raw.trim();
      if (!trimmed || (pending && offset < pending.payloadEnd)) continue;
      const structured =
        parseStructuredLines && (isContainer(trimmed) || format === "ndjson")
          ? readJson(trimmed)
          : undefined;
      const exception =
        structured === undefined && isExceptionContinuation(trimmed);
      const body =
        /(?:^|\s)(?:HTTP\/[\d.]+\s+\d{3}|(?:request|response)(?:\s+body)?\s*:|(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+HTTP\/[\d.]+)/i.test(
          trimmed,
        );
      const mightBeBody =
        isContainer(trimmed) || /^(?:<[a-z!?]|&(?:amp;)*lt;)/i.test(trimmed);
      const continuation =
        pending &&
        pending.value === undefined &&
        ((structured === undefined &&
          (exception || (pending.exception && /^[ \t]/.test(raw)))) ||
          (pending.body &&
            (/^[ \t]/.test(raw) || /^[\w-]+:\s/.test(trimmed) || mightBeBody)));
      if (continuation && pending) {
        pending.exception ||= exception;
        if (pending.body && mightBeBody) {
          pending.payloadEnd = multilinePayloadEnd(input, raw, offset);
          pending.body = false;
        }
        continue;
      }
      if (pending) {
        if (events.length === MAX_EVENTS - 1) {
          overflow(input.slice(pending.start));
          finished = true;
          break;
        }
        append(
          pending.value,
          input.slice(pending.start, offset),
          pending.warnings,
        );
        leading = offset;
      }
      const warnings =
        parseStructuredLines &&
        structured === undefined &&
        (isContainer(trimmed) || expectedJson)
          ? [malformed]
          : [];
      pending = {
        start: leading,
        value: structured,
        warnings,
        body,
        exception,
        payloadEnd:
          structured === undefined
            ? multilinePayloadEnd(input, raw, offset)
            : 0,
      };
    }
    if (!finished && pending)
      append(pending.value, input.slice(pending.start), pending.warnings);
  }
  return { format, events, summary: summarize(events) };
}
