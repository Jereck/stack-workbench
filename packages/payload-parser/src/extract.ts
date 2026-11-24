import { isRecord, parseBoundedJson, scanJsonContainer } from "./json";
import { readXml } from "./xml";

export const MAX_PAYLOAD_LENGTH = 64 * 1024;
const MAX_DECODE_DEPTH = 4;
const MAX_PROPERTY_DEPTH = 12;
const MAX_PAYLOADS = 24;
const MAX_VISITS = 512;
const MAX_SCAN_LENGTH = MAX_PAYLOAD_LENGTH * 4;

type Role = "request" | "response" | "body";

export interface Payload {
  kind: "JSON" | "XML" | "SOAP" | "Text";
  path: string;
  role?: Role;
  text: string;
  original?: string;
}

interface Location {
  path: string;
  role?: Role;
  body?: boolean;
}

function propertyLocation(parent: Location, key: string): Location {
  const segment = key.length > 160 ? key.slice(0, 159) + "…" : key;
  const path = /^[\w-]+$/.test(segment)
    ? parent.path + "." + segment
    : parent.path + "[" + JSON.stringify(segment) + "]";
  const name =
    key.length <= 160 ? key.replace(/[^a-z]/gi, "").toLowerCase() : "";
  const direction = name.includes("request")
    ? "request"
    : name.includes("response")
      ? "response"
      : undefined;
  const body =
    /^(?:(?:http)?(?:request|response))?(?:body|content|payload|entity)$/.test(
      name,
    );
  return {
    path: path.length > 512 ? path.slice(0, 511) + "…" : path,
    role: direction ?? parent.role ?? (body ? "body" : undefined),
    body,
  };
}

function decodeEntities(text: string) {
  const entities: Record<string, string> = {
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    amp: "&",
  };
  return text.replace(
    /&(lt|gt|quot|apos|amp|#x[\da-f]{1,6}|#\d{1,7});/gi,
    (entity, name: string) => {
      if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? entity;
      const code = /^#x/i.test(name)
        ? Number.parseInt(name.slice(2), 16)
        : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    },
  );
}

function decodeString(text: string): string | undefined {
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      const decoded = parseBoundedJson(text);
      if (typeof decoded === "string") return decoded;
    } catch {
      // A log may contain unquoted escape sequences.
    }
  }
  if (/&(?:amp;)*(?:lt|#60|#x0*3c);/i.test(text)) return decodeEntities(text);
  if (/\\(?:["\\]|u00(?:3c|7b|5b))/i.test(text)) {
    return text.replace(/\\(?:["\\/bfnrt]|u[\da-f]{4})/gi, (escape) => {
      try {
        return JSON.parse('"' + escape + '"') as string;
      } catch {
        return escape;
      }
    });
  }
}

function hasPayloadStart(text: string) {
  return /[{\[]|<(?:[a-z!?])|&(?:amp;)*(?:lt|#60|#x0*3c);|\\u00(?:3c|7b|5b)/i.test(
    text,
  );
}

function messageBody(text: string): { offset: number; role: Role } | undefined {
  const header = /\b(?:(request|response)[ \t]+)?body[ \t]*[:=][ \t]*/i.exec(
    text,
  );
  if (header && !/[{[<]/.test(text.slice(0, header.index))) {
    return {
      offset: header.index + header[0].length,
      role:
        header[1]?.toLowerCase() === "request"
          ? "request"
          : header[1]
            ? "response"
            : "body",
    };
  }
  const separator = /\r?\n\r?\n/.exec(text);
  if (separator) {
    const response = /^HTTP\/[\d.]+\s+[1-5]\d{2}\b/i.test(text);
    const request =
      /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE)\s+\S+\s+HTTP\/[\d.]+/i.test(
        text,
      );
    if (response || request)
      return {
        offset: separator.index + separator[0].length,
        role: response ? "response" : "request",
      };
  }
}

export function extractPayloads(
  sources: readonly { name: string; value: unknown }[],
  outputLimit = MAX_SCAN_LENGTH,
): { payloads: Payload[]; warnings: string[] } {
  const payloads: Payload[] = [];
  const warnings = new Set<string>();
  let outputLength = 0;
  let scanned = 0;
  let visits = 0;
  const seen = new Set<string>();

  function atLimit() {
    if (
      visits < MAX_VISITS &&
      scanned < MAX_SCAN_LENGTH &&
      payloads.length < MAX_PAYLOADS &&
      outputLength < outputLimit
    )
      return false;
    warnings.add("Payload extraction reached its processing limit.");
    return true;
  }

  function add(
    kind: Payload["kind"],
    text: string,
    location: Location,
    original?: string,
  ) {
    const preserved = original !== text ? original : undefined;
    const length = text.length + (preserved?.length ?? 0);
    if (outputLength + length > outputLimit) {
      warnings.add("Payload extraction reached its output limit.");
      return;
    }
    const identity = JSON.stringify([location.path, location.role, kind, text]);
    if (seen.has(identity)) return;
    seen.add(identity);
    outputLength += length;
    payloads.push({
      kind,
      text,
      path: location.path,
      role: location.role,
      original: preserved,
    });
  }

  function inspectText(
    value: string,
    location: Location,
    propertyDepth: number,
    decodingDepth: number,
    original?: string,
  ) {
    if (atLimit()) return;
    if (value.length > MAX_PAYLOAD_LENGTH) {
      if (
        location.body ||
        hasPayloadStart(value.slice(0, MAX_PAYLOAD_LENGTH))
      ) {
        warnings.add("A possible payload exceeds 64 Ki UTF-16 code units.");
      }
      return;
    }
    const text = value.trim();
    if (!text || (!location.body && !hasPayloadStart(text))) return;
    scanned += text.length;
    if (decodingDepth > MAX_DECODE_DEPTH) {
      warnings.add("A nested payload exceeds the decoding depth limit.");
      return;
    }

    const candidate = /[{\[]|<(?=[a-z!?])/gi;
    let match: RegExpExecArray | null;
    let found = false;
    let possible = false;
    while (!atLimit() && (match = candidate.exec(text))) {
      if (++visits >= MAX_VISITS) break;
      const start = match.index;
      if (match[0] === "<") {
        // Charge repeated parse attempts against the same per-event budget.
        scanned += text.length - start;
        const xml = readXml(text.slice(start));
        if (xml) {
          const raw = text.slice(start, start + xml.end);
          add(
            xml.kind,
            raw,
            location,
            original ?? (raw === text ? value : raw),
          );
          candidate.lastIndex = start + xml.end;
          found = true;
        } else {
          possible = true;
          // A malformed document or DTD must not be retried from a child element.
          break;
        }
        continue;
      }
      if (match[0] === "{" && !/[\s"}\\]/.test(text[start + 1] ?? "")) continue;
      // A square bracket in ordinary log prose is much more common than JSON.
      if (
        match[0] === "[" &&
        !/^\s*(?:[[{"\]\d-]|true\b|false\b|null\b)/.test(text.slice(start + 1))
      )
        continue;
      const { end, tooDeep } = scanJsonContainer(text, start);
      scanned += (end ?? text.length) - start;
      if (!end) {
        possible = true;
        if (tooDeep) warnings.add("A JSON payload exceeds the nesting limit.");
        break;
      }
      const raw = text.slice(start, end);
      candidate.lastIndex = end;
      try {
        const decoded = parseBoundedJson(raw);
        add("JSON", raw, location, original ?? (raw === text ? value : raw));
        found = true;
        visit(decoded, location, propertyDepth, decodingDepth + 1, false);
      } catch {
        possible = true;
      }
    }

    // Also try escaping layers when an event mixes independently embedded payloads.
    const decoded = decodeString(text);
    if (decoded !== undefined && decoded !== text && (!found || possible)) {
      inspectText(
        decoded,
        location,
        propertyDepth,
        decodingDepth + 1,
        original ?? value,
      );
      return;
    }
    if (possible)
      warnings.add("A possible embedded payload is malformed or unsupported.");
    if (!found && location.body) add("Text", value, location);
  }

  function visit(
    value: unknown,
    location: Location,
    propertyDepth: number,
    decodingDepth = 0,
    captureBody = true,
  ) {
    if (atLimit()) return;
    visits++;
    if (propertyDepth > MAX_PROPERTY_DEPTH) {
      warnings.add("Payload extraction skipped deeply nested properties.");
      return;
    }
    if (typeof value === "string") {
      inspectText(value, location, propertyDepth, decodingDepth);
    } else if (isRecord(value) || Array.isArray(value)) {
      if (location.body && captureBody) {
        const text = JSON.stringify(value);
        if (text.length <= MAX_PAYLOAD_LENGTH) add("JSON", text, location);
        else warnings.add("A structured body exceeds 64 Ki UTF-16 code units.");
      }
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length && !atLimit(); index++) {
          visit(
            value[index],
            {
              ...location,
              path: location.path + "[" + index + "]",
              body: false,
            },
            propertyDepth + 1,
            decodingDepth,
          );
        }
      } else {
        for (const key of Object.keys(value)) {
          if (atLimit()) break;
          visit(
            value[key],
            propertyLocation(location, key),
            propertyDepth + 1,
            decodingDepth,
          );
        }
      }
    }
  }

  for (const { name, value } of sources) {
    const body =
      name === "message" &&
      typeof value === "string" &&
      value.length <= MAX_PAYLOAD_LENGTH
        ? messageBody(value)
        : undefined;
    if (body && typeof value === "string") {
      visit(value.slice(0, body.offset), { path: name }, 0);
      visit(
        value.slice(body.offset),
        { path: name + ".body", role: body.role, body: true },
        0,
      );
    } else visit(value, { path: name }, 0);
  }
  return { payloads, warnings: [...warnings] };
}
