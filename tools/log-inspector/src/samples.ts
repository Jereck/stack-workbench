const api = [
  {
    timestamp: "2026-06-17T09:41:02.110-04:00",
    level: "Information",
    service: "orders-api",
    message: "POST /v1/orders",
    requestId: "req-demo-1042",
    traceId: "trace-demo-orders",
    http: {
      request: {
        method: "POST",
        path: "/v1/orders",
        body: JSON.stringify({ orderId: "demo-4402", quantity: 2 }),
      },
    },
  },
  {
    timestamp: "2026-06-17T13:41:03.103Z",
    level: "Warning",
    service: "orders-api",
    message: "Inventory partner responded slowly",
    requestId: "req-demo-1042",
    traceId: "trace-demo-orders",
    responseBody: JSON.stringify(
      JSON.stringify({ partner: "inventory-demo", state: "retrying" }),
    ),
  },
  {
    timestamp: "2026-06-17T13:41:04.216Z",
    level: "Error",
    service: "orders-api",
    message: "POST /v1/orders responded 502",
    requestId: "req-demo-1042",
    traceId: "trace-demo-orders",
    httpStatusCode: 502,
    exception: {
      type: "PartnerUnavailableException",
      message: "Inventory partner timed out",
      stack: "at Demo.Orders.Submit() in Orders.cs:line 42",
      innerException: {
        type: "TimeoutException",
        message: "No partner response within 750 ms",
      },
    },
    responseBody:
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultstring>Inventory timeout</faultstring></s:Fault></s:Body></s:Envelope>',
  },
  {
    timestamp: "2026-06-17T13:41:05.812Z",
    level: "Information",
    service: "orders-api",
    message: "GET /health 200",
    requestId: "req-demo-1043",
  },
]
  .map((event) => JSON.stringify(event))
  .join("\n");

const serilog = [
  "2026-06-17 09:41:01.420 -04:00 [INF] Started synthetic checkout requestId=demo-checkout",
  "2026-06-17 09:41:02.151 -04:00 [ERR] POST /checkout responded 503 requestId=demo-checkout",
  "Demo.CheckoutException: Payment partner unavailable",
  " ---> System.TimeoutException: The synthetic partner timed out",
  "   at Demo.Checkout.Submit() in Checkout.cs:line 18",
  "   --- End of inner exception stack trace ---",
  "2026-06-17 09:41:03.302 -04:00 [DBG] Retry scheduled requestId=demo-checkout",
].join("\n");

const cloudwatch = JSON.stringify(
  {
    logGroup: "/demo/fulfillment",
    logStream: "synthetic-01",
    events: [
      {
        timestamp: 1781703662000,
        message: JSON.stringify({
          level: "info",
          message: "Fulfillment worker ready",
        }),
        eventId: "demo-01",
      },
      {
        timestamp: 1781703663000,
        message: JSON.stringify({
          level: "warn",
          message: "Response body: &lt;status&gt;retry&lt;/status&gt;",
          correlationId: "demo-queue",
        }),
        eventId: "demo-02",
      },
    ],
  },
  null,
  2,
);

export const samples = [
  { id: "api", label: "API integration · JSON Lines", text: api },
  { id: "serilog", label: "Checkout failure · Serilog text", text: serilog },
  {
    id: "cloudwatch",
    label: "Fulfillment worker · CloudWatch JSON",
    text: cloudwatch,
  },
] as const;
