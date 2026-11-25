import { ComparisonError } from "./error";
import {
  detectLogLineFormat,
  detectStructuredLogFormat,
  inputExceedsLimit,
  parseLogs,
} from "@stack-workbench/log-parser";
import type { LogEvent } from "@stack-workbench/log-parser";
import {
  isRecord,
  MAX_JSON_DEPTH,
  parseBoundedJson,
  parseXmlDocument,
} from "@stack-workbench/payload-parser";
import { looksLikeHttp, parseHttp } from "./http";
import type {
  ComparisonConfiguration,
  ComparisonInput,
  ComparisonValue,
  InputData,
  ParsingWarning,
  PayloadData,
  Side,
} from "./model";

const maxJsonNodes = 150_000;
const maxDecodingSteps = 4;
const maxDecodedUnits = 4 * 1024 * 1024;

const looksLikeJson = (text: string) => {
  const candidate = text.trimStart();
  return /^(?:\{|\[\s*(?:[[{"\]\d-]|true\b|false\b|null\b|$))/.test(candidate);
};
const looksLikeXml = (text: string) => text.trimStart().startsWith("<");

function readJson(text: string): unknown {
  try {
    return parseBoundedJson(text);
  } catch {
    throw new ComparisonError(
      "Invalid JSON. Check the syntax, use one JSON document, and keep nesting within 48 levels.",
    );
  }
}

function jsonValue(
  value: unknown,
  decode: boolean,
  log = false,
): ComparisonValue {
  let visited = 0;
  let decodeUnits = 0;
  function visit(
    current: unknown,
    depth: number,
    decoded: number,
  ): ComparisonValue {
    if (++visited > maxJsonNodes || depth > MAX_JSON_DEPTH + (log ? 4 : 0))
      throw new ComparisonError(
        "Normalized input exceeds the value or nesting limit. Compare a smaller excerpt.",
      );
    if (typeof current === "string") {
      if (!decode || decoded >= maxDecodingSteps) return current;
      let candidate = current.trimStart();
      let steps = decoded;
      while (
        steps < maxDecodingSteps &&
        (looksLikeJson(candidate) || candidate.startsWith('"'))
      ) {
        decodeUnits += candidate.length;
        if (decodeUnits > maxDecodedUnits)
          throw new ComparisonError(
            "Escaped JSON exceeds the decoding limit. Disable escaped JSON normalization or compare a smaller excerpt.",
          );
        let parsed: unknown;
        try {
          parsed = parseBoundedJson(candidate);
        } catch {
          return current;
        }
        steps++;
        if (typeof parsed === "string") candidate = parsed.trimStart();
        else if (Array.isArray(parsed) || isRecord(parsed))
          return visit(parsed, depth, steps);
        else break;
      }
      return current;
    }
    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "number") {
      if (
        !Number.isFinite(current) ||
        (Number.isInteger(current) && !Number.isSafeInteger(current))
      )
        throw new ComparisonError(
          "JSON contains a number outside safe JavaScript numeric range. Encode it as a string to preserve its digits.",
        );
      return current;
    }
    if (Array.isArray(current))
      return current.map((item: unknown) => visit(item, depth + 1, decoded));
    if (isRecord(current))
      return Object.fromEntries(
        Object.entries(current)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, visit(item, depth + 1, decoded)]),
      );
    throw new ComparisonError("JSON contains an unsupported value.");
  }
  return visit(value, 0, 0);
}

function parsePayload(
  text: string,
  config: ComparisonConfiguration,
  format: "auto" | "json" | "xml" | "soap" | "text",
  knownJson?: { value: unknown },
): PayloadData {
  if (
    format === "json" ||
    (format === "auto" &&
      (looksLikeJson(text) ||
        (config.json?.decodeEscaped && text.trimStart().startsWith('"'))))
  ) {
    return {
      kind: "json",
      value: jsonValue(
        knownJson ? knownJson.value : readJson(text),
        Boolean(config.json?.decodeEscaped),
      ),
    };
  }
  if (
    format === "xml" ||
    format === "soap" ||
    (format === "auto" && looksLikeXml(text))
  ) {
    const { kind, root } = parseXmlDocument(text);
    if (format === "soap" && kind !== "SOAP")
      throw new ComparisonError(
        "Select XML or supply a SOAP 1.1 or 1.2 envelope.",
      );
    return { kind: kind === "SOAP" ? "soap" : "xml", root };
  }
  return { kind: "text", text };
}

function mediaFormat(contentType: string | undefined) {
  if (!contentType) return "auto";
  const type = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (/[/+]json$/.test(type)) return "json";
  if (/[/+]xml$/.test(type)) return "xml";
  return "text";
}

export function parseInput(
  input: ComparisonInput,
  side: Side,
  config: ComparisonConfiguration,
): {
  data: InputData;
  warnings: ParsingWarning[];
} {
  const { text, format = "auto" } = input;
  if (inputExceedsLimit(text))
    throw new ComparisonError(
      "Input exceeds 4 MiB of UTF-8. Compare a smaller excerpt.",
    );
  const warnings: ParsingWarning[] = [];
  let logFormat = input.logFormat;
  let knownJson: { value: unknown } | undefined;
  if (format === "auto" && looksLikeJson(text)) {
    try {
      knownJson = { value: parseBoundedJson(text) };
    } catch {
      // NDJSON can start with a JSON object and is detected before parsing a document.
    }
    if (knownJson) {
      const detected = detectStructuredLogFormat(knownJson.value);
      if (detected !== "json") logFormat = detected;
    }
  }
  if (
    format === "auto" &&
    !knownJson &&
    !looksLikeHttp(text.trimStart()) &&
    !looksLikeXml(text)
  ) {
    const detected = detectLogLineFormat(text);
    if (detected !== "text") logFormat = detected;
  }
  if (format === "log" || (format === "auto" && logFormat)) {
    const logs = parseLogs(text, logFormat);
    for (const [message, count] of Object.entries(logs.summary.warnings)) {
      warnings.push({ side, message, count });
    }
    const events = logs.events.map((event) => {
      const normalized: Partial<LogEvent> = { ...event };
      delete normalized.index;
      delete normalized.warnings;
      const retained = logs.format === "text" || event.warnings.length > 0;
      if (!retained) delete normalized.raw;
      return normalized;
    });
    const value = jsonValue(events, false, true);
    return { data: { kind: "log", logs, value }, warnings };
  }
  const autoHttp = format === "auto" && looksLikeHttp(text.trimStart());
  if (format === "http" || autoHttp) {
    const message = parseHttp(
      text.replace(/^\uFEFF/, ""),
      input.recordedDurationMs,
      (body, contentType) =>
        parsePayload(body, config, mediaFormat(contentType)),
    );
    return { data: { kind: "http", message }, warnings };
  }
  const data = parsePayload(text, config, format, knownJson);
  return { data, warnings };
}
