export const privacyMarker = "SYNTHETIC_PRIVATE_LOG_56172";
export const deliberateHtml =
  '<img src="https://example.invalid/' +
  privacyMarker +
  '" onerror="throw 1" />';
export const maliciousXml =
  '<!DOCTYPE doc SYSTEM "https://example.invalid/' +
  privacyMarker +
  '"><doc>&external;</doc>';
export const soap =
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Result>denied</Result></s:Body></s:Envelope>';
export const compact =
  '{"@t":"2026-06-17T13:41:01.123456789Z","@mt":"Payment attempt for {OrderId}","OrderId":"demo-1","@tr":"trace-demo","@sp":"span-demo","SourceContext":"Demo.Payments"}';
export const invalidJson = '{"message":"fixture is intentionally truncated"';
export const deepJson = "[".repeat(50) + "0" + "]".repeat(50);
export const multiline = [
  "2026-06-17 09:41:01.123 -04:00 [ERR] HTTP POST /checkout responded 503 requestId=shared",
  "Demo.CheckoutException: The partner failed",
  "   at Demo.Checkout.Send()",
  " ---> System.TimeoutException: Slow response",
  "   at Demo.Partner.Receive()",
  "2026-06-17T13:41:02+00:00 [INF] Retry scheduled requestId=shared",
  "unknown line preserved",
].join("\r\n");
export const cloudwatch = JSON.stringify(
  {
    logGroup: "/demo/service",
    logStream: "stream-demo",
    events: [
      {
        timestamp: 1781703661000,
        eventId: "event-1",
        message:
          '{"level":"WARN","message":"Partner delay","correlationId":"shared"}',
      },
      {
        timestamp: 1781703662000,
        eventId: "event-2",
        message: "Unstructured CloudWatch event",
      },
    ],
  },
  null,
  2,
);

export const sensitive = {
  Authorization: "Basic ZGVtbzpwYXNz",
  "X-API-Key": "synthetic-api-secret",
  password: "synthetic-password",
  client_secret: "synthetic-client-secret",
  "Set-Cookie": "demo=synthetic-cookie; Secure",
  connectionString: "Server=demo;Database=demo;User Id=synthetic-login",
  email: "synthetic@fixture.example",
};

export const browserLogs =
  [
    {
      message: privacyMarker + " POST /payments responded 503",
      level: "error",
      timestamp: "2026-06-17T09:41:02-04:00",
      requestId: "req-demo",
      responseBody: JSON.stringify(
        JSON.stringify({
          outcome: "denied",
          password: sensitive.password,
          markup: deliberateHtml,
        }),
      ),
      exception: {
        type: "PartnerException",
        message: "Upstream rejected request",
        stack: "at Demo.Payment.Send()",
        cause: { type: "TimeoutException", message: "Synthetic timeout" },
      },
    },
    {
      message: "Payment retry queued",
      level: "warn",
      timestamp: "2026-06-17T13:41:01Z",
      requestId: "req-demo",
      requestBody: soap,
    },
    {
      message: "Health check ready",
      level: "info",
      traceId: "req-demo",
      payload: maliciousXml,
    },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n") +
  "\n" +
  invalidJson;
