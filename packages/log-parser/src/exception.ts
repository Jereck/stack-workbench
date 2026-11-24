import { isRecord } from "@stack-workbench/payload-parser";
import type { LogException } from "./model";

const header =
  /^\s*(?:(?:Caused by:|Inner exception:|--->|Exception in thread "[^"]+")\s*)?((?:[\w$]+\.)*[\w$]*(?:Exception|Error|Fault|Throwable))(?::\s*(.*))?\s*$/i;

export function isExceptionContinuation(line: string) {
  return (
    header.test(line) ||
    /^\s*(?:at\s|Caused by:|Inner exception:|--->|--- End of|Suppressed:|\.\.\. \d+ (?:more|common frames omitted)|Traceback \(most recent call last\):|File "[^"]+", line \d+)/i.test(
      line,
    )
  );
}

function readText(text: string, explicit: boolean): LogException | undefined {
  let root: LogException | undefined;
  let current: LogException | undefined;
  let stack: string[] = [];
  let depth = 0;
  for (const line of text.split(/\r\n|\n|\r/)) {
    const match = header.exec(line);
    if (
      match &&
      (!current ||
        /^\s*(?:Caused by:|Inner exception:|--->)/i.test(line) ||
        !current.type)
    ) {
      if (current?.type && depth < 8) {
        current.stack = stack.length ? stack.join("\n") : undefined;
        const cause = {};
        current.cause = cause;
        current = cause;
        stack = [];
        depth++;
      }
      if (!current) root = current = {};
      if (!current.type) {
        current.type = match[1];
        current.message = match[2];
      } else stack.push(line);
    } else if (current) stack.push(line);
    else if (isExceptionContinuation(line)) {
      root = current = {};
      stack.push(line);
    }
  }
  if (current) current.stack = stack.length ? stack.join("\n") : undefined;
  return root ?? (explicit && text.trim() ? { message: text } : undefined);
}

export function normalizeException(
  value: unknown,
  depth = 0,
): LogException | undefined {
  if (depth >= 8) return;
  if (typeof value === "string") return readText(value, true);
  if (!isRecord(value)) return;
  const fields = new Map(
    Object.entries(value).map(([key, field]) => [key.toLowerCase(), field]),
  );
  const type =
    fields.get("type") ?? fields.get("classname") ?? fields.get("name");
  const message = fields.get("message");
  const stack =
    fields.get("stacktrace") ??
    fields.get("stack_trace") ??
    fields.get("stack");
  const cause = normalizeException(
    fields.get("innerexception") ?? fields.get("cause") ?? fields.get("inner"),
    depth + 1,
  );
  if (
    typeof type !== "string" &&
    typeof message !== "string" &&
    typeof stack !== "string" &&
    !cause
  )
    return;
  return {
    type: typeof type === "string" ? type : undefined,
    message: typeof message === "string" ? message : undefined,
    stack: typeof stack === "string" ? stack : undefined,
    cause,
  };
}

export function exceptionFromMessage(text: string) {
  return readText(text, false);
}
