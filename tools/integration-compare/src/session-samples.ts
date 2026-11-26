function recordedSession(
  environment: string,
  status: number,
  durationMs: number,
) {
  const traceId = "demo-" + environment;
  const requestId = "request-" + environment;
  const base = {
    traceId,
    service: "inventory-demo",
    operation: "Reserve products",
  };
  return [
    {
      ...base,
      requestId,
      phase: "request",
      method: "POST",
      url: "https://" + environment + ".example.invalid/inventory/reservations",
      level: "info",
      message: "Reserve request",
      requestBody: { orderId: "DEMO-102", quantity: 2 },
    },
    {
      ...base,
      requestId,
      phase: "response",
      method: "POST",
      url: "/inventory/reservations",
      level: status === 200 ? "info" : "error",
      message: "Reserve response",
      status,
      durationMs,
      responseBody:
        status === 200
          ? { allocation: { id: "DEMO-ALLOC", quantity: 2 } }
          : { allocation: null, error: "DEMO_UNAVAILABLE" },
    },
    {
      traceId,
      service: "orders-demo",
      level: "info",
      operation: "Finalize order",
      message: "Finished synthetic workflow",
    },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");
}

export const sessionSamples = {
  baseline: recordedSession("dev", 200, 342),
  target: recordedSession("qa", 502, 4821),
};
