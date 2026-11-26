export const logLines = (...rows: Record<string, unknown>[]) =>
  rows.map((row) => JSON.stringify(row)).join("\n");

export function transaction({
  environment,
  order = "demo-order",
  status = 200,
  durationMs = 342,
  response = true,
}: {
  environment: string;
  order?: string;
  status?: number;
  durationMs?: number;
  response?: boolean;
}) {
  const common = {
    traceId: "trace-" + environment,
    requestId: environment + "-" + order,
    service: "inventory",
    operation: "Reserve",
    method: "POST",
  };
  const request = {
    ...common,
    phase: "request",
    url:
      "https://" +
      environment +
      ".example.invalid/api/reserve/?trace=" +
      environment,
    level: "info",
    message: "Request sent",
    requestBody: { order },
  };
  const captured = {
    ...common,
    phase: "response",
    status,
    durationMs,
    level: status === 200 ? "info" : "error",
    message: "Response recorded",
    responseBody:
      status === 200
        ? { details: { quantity: 2 } }
        : { details: { quantity: "0" }, reason: "Unavailable" },
  };
  return response ? [request, captured] : [request];
}
