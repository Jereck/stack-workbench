import type { LogEvent, LogLevel } from "./model";

export const correlationFields = [
  "traceId",
  "correlationId",
  "requestId",
] as const;
export type CorrelationField = (typeof correlationFields)[number];

export interface Correlation {
  field: CorrelationField;
  value: string;
}

export interface CorrelationGroup extends Correlation {
  count: number;
}

export function groupCorrelations(
  events: readonly LogEvent[],
): CorrelationGroup[] {
  const groups = new Map<string, CorrelationGroup>();
  for (const event of events) {
    for (const field of correlationFields) {
      const value = event[field];
      if (!value) continue;
      const key = field + ":" + value;
      const existing = groups.get(key);
      if (existing) existing.count++;
      else groups.set(key, { field, value, count: 1 });
    }
  }
  return [...groups.values()].sort(
    (first, second) => second.count - first.count,
  );
}

export function filterEvents(
  events: readonly LogEvent[],
  options: {
    query?: string;
    severity?: LogLevel;
    identifier?: string;
    correlation?: Correlation;
    exceptionsOnly?: boolean;
    order?: "input" | "newest" | "oldest";
  },
): LogEvent[] {
  const query = options.query?.trim().toLowerCase();
  const identifier = options.identifier?.trim();
  const correlation = options.correlation;
  const filtered = events.filter(
    (event) =>
      (!options.severity || event.level === options.severity) &&
      (!identifier ||
        correlationFields.some((field) => event[field] === identifier)) &&
      (!correlation || event[correlation.field] === correlation.value) &&
      (!options.exceptionsOnly || Boolean(event.exception)) &&
      (!query ||
        event.raw.toLowerCase().includes(query) ||
        event.message.toLowerCase().includes(query) ||
        event.payloads.some((payload) =>
          payload.text.toLowerCase().includes(query),
        )),
  );
  if (!options.order || options.order === "input") return filtered;
  const direction = options.order === "oldest" ? 1 : -1;
  return filtered.sort((first, second) => {
    const a = first.timestamp?.utc;
    const b = second.timestamp?.utc;
    if (a === b) return first.index - second.index;
    if (!a) return 1;
    if (!b) return -1;
    return (a < b ? -1 : 1) * direction;
  });
}
