import { XmlParseError } from "@stack-workbench/payload-parser";
import { ComparisonError } from "./error";
import type { HttpMessage, PayloadData } from "./model";

const requestLine =
  /^([!#$%&'*+.^_\x60|~\w-]+) ([^\s\x00-\x1f\x7f]+) HTTP\/(\d+(?:\.\d+)?)$/;
const responseLine = /^HTTP\/(\d+(?:\.\d+)?) ([1-5]\d\d)(?: [^\r\n]*)?$/;
const headerLine = /^([!#$%&'*+.^_\x60|~\w-]+):([^\x00-\x08\x0a-\x1f\x7f]*)$/;
const maxFields = 8_000;

export function looksLikeHttp(text: string) {
  return /^(?:HTTP\/|[A-Z][A-Z0-9_-]* [^\r\n ]+ HTTP\/)/.test(text);
}

function append(fields: Map<string, string[]>, name: string, value: string) {
  const values = fields.get(name);
  if (values) values.push(value);
  else fields.set(name, [value]);
}

function requestAddress(target: string) {
  if (target.includes("#"))
    throw new ComparisonError(
      "Remove the fragment from the HTTP request target.",
    );
  const question = target.indexOf("?");
  const address = question < 0 ? target : target.slice(0, question);
  const query = new Map<string, string[]>();
  if (question >= 0) {
    const decode = (value: string) =>
      decodeURIComponent(value.replaceAll("+", " "));
    const parameters = target.slice(question + 1).split("&", maxFields + 1);
    if (parameters.length > maxFields)
      throw new ComparisonError(
        "The request has over 8,000 query fields. Compare a smaller excerpt.",
      );
    for (const parameter of parameters) {
      if (!parameter) continue;
      const equals = parameter.indexOf("=");
      try {
        append(
          query,
          decode(equals < 0 ? parameter : parameter.slice(0, equals)),
          equals < 0 ? "" : decode(parameter.slice(equals + 1)),
        );
      } catch {
        throw new ComparisonError(
          "Fix the invalid percent encoding in the HTTP query string.",
        );
      }
    }
  }
  // Preserve the recorded path spelling and never construct or fetch a URL.
  const absolute = /^[a-z][a-z\d+.-]*:\/\/[^/]+(\/.*)?$/i.exec(address);
  return {
    address,
    path: absolute
      ? (absolute[1] ?? "/")
      : address.startsWith("/")
        ? address
        : undefined,
    query: Object.fromEntries(query),
  };
}

function trimHeaderValue(value: string) {
  let start = 0;
  let end = value.length;
  const space = (at: number) => value[at] === " " || value[at] === "\t";
  while (start < end && space(start)) start++;
  while (end > start && space(end - 1)) end--;
  return value.slice(start, end);
}

export function parseHttp(
  text: string,
  duration: number | undefined,
  parseBody: (text: string, contentType?: string) => PayloadData,
): HttpMessage {
  const separator = /\r\n\r\n|\n\n|\r\r/.exec(text);
  const headerText = separator ? text.slice(0, separator.index) : text;
  const [start = "", ...lines] = headerText.split(/\r\n|\n|\r/, maxFields + 3);
  const request = requestLine.exec(start);
  const response = responseLine.exec(start);
  if (!request && !response)
    throw new ComparisonError(
      "Enter an HTTP request line or an HTTP response line with a status code.",
      { line: 1 },
    );
  if (lines.at(-1) === "" && !separator) lines.pop();
  if (lines.length > maxFields)
    throw new ComparisonError(
      "The message has over 8,000 headers. Compare a smaller excerpt.",
    );
  const headers = new Map<string, string[]>();
  for (let index = 0; index < lines.length; index++) {
    const header = headerLine.exec(lines[index] ?? "");
    if (!header?.[1] || header[2] === undefined)
      throw new ComparisonError(
        "Fix the HTTP header and separate the body with a blank line.",
        { line: index + 2 },
      );
    append(headers, header[1].toLowerCase(), trimHeaderValue(header[2]));
  }
  if (duration !== undefined && (!Number.isFinite(duration) || duration < 0))
    throw new ComparisonError(
      "Recorded HTTP duration must be a finite, nonnegative number of milliseconds.",
    );
  const bodyText = separator
    ? text.slice(separator.index + separator[0].length)
    : "";
  if (
    bodyText &&
    (headers.get("transfer-encoding") ?? []).some(
      (value) => value.toLowerCase() !== "identity",
    )
  )
    throw new ComparisonError(
      "Enter the decoded HTTP body and remove the Transfer-Encoding header.",
    );
  if (
    bodyText &&
    (headers.get("content-encoding") ?? []).some(
      (value) => value.toLowerCase() !== "identity",
    )
  )
    throw new ComparisonError(
      "Enter the decoded HTTP body and remove the Content-Encoding header.",
    );
  let body: PayloadData | undefined;
  if (bodyText) {
    try {
      body = parseBody(bodyText, headers.get("content-type")?.[0]);
    } catch (error) {
      if (!(error instanceof ComparisonError || error instanceof XmlParseError))
        throw error;
      const location = error.location;
      throw new ComparisonError("HTTP body. " + error.message, {
        line: lines.length + 2 + (location?.line ?? 1),
        column: location?.column,
      });
    }
  }
  return {
    kind: request ? "request" : "response",
    version: request?.[3] ?? response?.[1] ?? "",
    method: request?.[1],
    ...(request?.[2] ? requestAddress(request[2]) : { query: {} }),
    status: response ? Number(response[2]) : undefined,
    headers: Object.fromEntries(headers),
    body,
    recordedDurationMs: duration,
  };
}
