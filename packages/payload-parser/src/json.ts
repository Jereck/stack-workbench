export const MAX_JSON_DEPTH = 48;
const MAX_STRUCTURE_MARKERS = 500_000;

// Walk the container before JSON.parse so consumers never receive unbounded depth.
export function scanJsonContainer(
  text: string,
  start: number,
  limit = text.length,
): { end?: number; tooDeep?: boolean } {
  const stack: string[] = [];
  let quoted = false;
  let markers = 0;
  for (let index = start; index < limit; index++) {
    const character = text[index];
    if (quoted) {
      if (character === "\\") index++;
      else if (character === '"') quoted = false;
      else if (character && character < " ") return {};
      continue;
    }
    switch (character) {
      case '"':
        quoted = true;
        break;
      case "{":
      case "[":
        if (++markers > MAX_STRUCTURE_MARKERS) return {};
        stack.push(character === "{" ? "}" : "]");
        if (stack.length > MAX_JSON_DEPTH) return { tooDeep: true };
        break;
      case "}":
      case "]":
        if (stack.pop() !== character) return {};
        if (stack.length === 0) return { end: index + 1 };
        break;
      case ",":
      case ":":
        if (++markers > MAX_STRUCTURE_MARKERS) return {};
        break;
    }
  }
  return {};
}

export function parseBoundedJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const { end, tooDeep } = scanJsonContainer(trimmed, 0);
    if (tooDeep) throw new Error("JSON exceeds the nesting limit.");
    if (end !== trimmed.length) throw new Error("Invalid JSON container.");
  }
  const value: unknown = JSON.parse(trimmed);
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
