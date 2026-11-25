import type { ComparisonResult } from "../../packages/comparison-engine/src";

export function soapFault(
  prefix: string,
  code: string,
  reason: string,
  requestId = "synthetic",
) {
  const ns = "http://schemas.xmlsoap.org/soap/envelope/";
  return [
    "<" + prefix + ":Envelope xmlns:" + prefix + '="' + ns + '">',
    "  <" +
      prefix +
      ":Header><requestId>" +
      requestId +
      "</requestId></" +
      prefix +
      ":Header>",
    "  <" + prefix + ":Body>",
    "    <" +
      prefix +
      ":Fault><faultcode>" +
      prefix +
      ":" +
      code +
      "</faultcode><faultstring>" +
      reason +
      "</faultstring></" +
      prefix +
      ":Fault>",
    "  </" + prefix + ":Body>",
    "</" + prefix + ":Envelope>",
  ].join("\n");
}

export function httpJsonResponse(
  status: number,
  body: string,
  extras: string[] = [],
) {
  return [
    "HTTP/1.1 " + status,
    "Content-Type: application/vnd.synthetic+json",
    ...extras,
    "",
    body,
  ].join("\r\n");
}

export const syntheticExternalEntity =
  '<!DOCTYPE test [<!ENTITY demo SYSTEM "https://example.invalid/compare-private-fixture">]><test>&demo;</test>';

export function completed(result: ComparisonResult) {
  if (result.status === "failed")
    throw new Error(JSON.stringify(result.errors));
  return result;
}
