const orders = (status: string, quantity: number, id: string) =>
  JSON.stringify(
    {
      orderId: "demo-1042",
      status,
      requestId: id,
      items: [
        { sku: "DEMO-01", quantity },
        { sku: "DEMO-02", quantity: 1 },
      ],
      currency: "USD",
    },
    null,
    2,
  );

const soap = (code: string, message: string) =>
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">\n' +
  "  <s:Body>\n    <s:Fault>\n" +
  "      <faultcode>s:" +
  code +
  "</faultcode>\n" +
  "      <faultstring>" +
  message +
  "</faultstring>\n" +
  "    </s:Fault>\n  </s:Body>\n</s:Envelope>";

export const samples = [
  {
    name: "Order JSON",
    baseline: orders("accepted", 4, "demo-a"),
    target: orders("pending", 2, "demo-b"),
  },
  {
    name: "SOAP fault",
    baseline: soap("Client", "Invalid order"),
    target: soap("Server", "Service unavailable"),
  },
  {
    name: "Plain-text response",
    baseline:
      "Order validation\nInventory reserved\nPayment accepted\nComplete\n",
    target: "Order validation\nInventory pending\nPayment deferred\nComplete\n",
  },
  {
    name: "HTTP response",
    baseline:
      'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"availability":"in-stock","quantity":4}',
    target:
      'HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\n\r\n{"availability":"unknown","quantity":null}',
  },
] as const;
