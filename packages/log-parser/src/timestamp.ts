import type { LogTimestamp } from "./model";

const iso =
  /^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d:\d\d)([.,]\d{1,9})?(?:\s?(Z|[+-]\d\d:?\d\d))?$/i;

export function readTimestamp(
  value: unknown,
  epochMilliseconds = false,
): LogTimestamp | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    const digits = String(Math.abs(value)).length;
    if (epochMilliseconds || digits === 10 || digits === 13) {
      const date = new Date(
        !epochMilliseconds && digits === 10 ? value * 1000 : value,
      );
      if (Number.isFinite(date.getTime()))
        return {
          original: value,
          offset: "UTC",
          utc: date.toISOString().replace(/Z$/, "000000Z"),
        };
    }
    return { original: value };
  }
  if (typeof value !== "string" || !value.trim()) return;
  const match = iso.exec(value.trim());
  if (!match) return { original: value };
  const [, day, time, fraction, offset] = match;
  if (!offset) return { original: value };
  const dateOnly = new Date(day + "T00:00:00Z");
  const validDay =
    Number.isFinite(dateOnly.getTime()) &&
    dateOnly.toISOString().startsWith(day + "T");
  if (!validDay || time?.startsWith("24")) return { original: value, offset };
  const normalizedOffset =
    offset.length === 5
      ? offset.slice(0, 3) + ":" + offset.slice(3)
      : offset.toUpperCase();
  const millis = fraction ? "." + fraction.slice(1, 4).padEnd(3, "0") : "";
  const date = new Date(day + "T" + time + millis + normalizedOffset);
  const submillis = (fraction?.slice(4) ?? "").padEnd(6, "0");
  return {
    original: value,
    offset,
    utc: Number.isFinite(date.getTime())
      ? date.toISOString().replace(/Z$/, submillis + "Z")
      : undefined,
  };
}
