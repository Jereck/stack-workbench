import { SaxesParser } from "saxes";

const soapNamespaces = new Set([
  "http://schemas.xmlsoap.org/soap/envelope/",
  "http://www.w3.org/2003/05/soap-envelope",
]);

// The parser stops at the root closing tag, even when log text follows it.
export function readXml(
  text: string,
): { end: number; kind: "XML" | "SOAP" } | undefined {
  const parser = new SaxesParser({ xmlns: true });
  const endOfRoot = Symbol();
  let depth = 0;
  let end = 0;
  let kind: "XML" | "SOAP" = "XML";
  parser.on("doctype", () => {
    throw new Error("XML document type declarations are unsupported.");
  });
  parser.on("opentag", (tag) => {
    if (
      depth === 0 &&
      tag.local === "Envelope" &&
      soapNamespaces.has(tag.uri)
    ) {
      kind = "SOAP";
    }
    if (++depth > 48) throw new Error("XML exceeds the nesting limit.");
  });
  parser.on("closetag", () => {
    if (--depth === 0) {
      end = parser.position;
      throw endOfRoot;
    }
  });
  try {
    parser.write(text).close();
  } catch (error) {
    if (error === endOfRoot) return { end, kind };
  }
}
