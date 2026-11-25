import { SaxesParser } from "saxes";

const soap11 = "http://schemas.xmlsoap.org/soap/envelope/";
const soap12 = "http://www.w3.org/2003/05/soap-envelope";
const soapNamespaces = new Set([soap11, soap12]);
const xmlNamespace = "http://www.w3.org/XML/1998/namespace";
const xmlnsNamespace = "http://www.w3.org/2000/xmlns/";

export function isSoapNamespace(uri: string) {
  return soapNamespaces.has(uri);
}

export interface XmlText {
  value: string;
  qualifiedValue?: string;
}

export interface XmlElement {
  name: string;
  local: string;
  namespace: string;
  attributes: Record<string, string>;
  content: (XmlText | XmlElement)[];
  preserveSpace: boolean;
  location: { line: number; column: number };
}

export class XmlParseError extends Error {
  constructor(
    message: string,
    readonly location: { line: number; column: number },
  ) {
    super(message);
  }
}

function expandedName(uri: string, local: string) {
  return uri ? `{${uri}}${local}` : local;
}

function scanXml(text: string, mode: "prefix" | "document") {
  const parser = new SaxesParser({ xmlns: true });
  const endOfRoot = Symbol();
  const elements: XmlElement[] = [];
  let depth = 0;
  let end = 0;
  let nodes = 0;
  let kind: "XML" | "SOAP" = "XML";
  let root: XmlElement | undefined;
  const location = () => ({
    line: parser.line,
    column: Math.max(1, parser.column),
  });
  const fail = (message: string): never => {
    throw new XmlParseError(message, location());
  };
  parser.on("error", () =>
    fail(
      "Malformed XML. Check the element names, nesting, and entity references.",
    ),
  );
  parser.on("doctype", () =>
    fail(
      "XML document type declarations are unsupported. Remove the DOCTYPE and use literal values.",
    ),
  );
  let opener = location();
  parser.on("opentagstart", () => {
    opener = location();
  });
  parser.on("opentag", (tag) => {
    if (depth === 0 && tag.local === "Envelope" && isSoapNamespace(tag.uri))
      kind = "SOAP";
    if (++depth > 48) fail("XML exceeds the 48-level nesting limit.");
    if (mode === "prefix") return;
    const parent = elements.at(-1);
    const attributes = Object.fromEntries(
      Object.values(tag.attributes)
        .filter(({ uri }) => uri !== xmlnsNamespace)
        .map(({ uri, local, value }) => [expandedName(uri, local), value]),
    );
    nodes += 1 + Object.keys(attributes).length;
    if (nodes > 100_000) fail("XML exceeds the 100,000-node limit.");
    const space = attributes[expandedName(xmlNamespace, "space")];
    const element: XmlElement = {
      name: expandedName(tag.uri, tag.local),
      local: tag.local,
      namespace: tag.uri,
      attributes,
      content: [],
      preserveSpace:
        space === "preserve" ||
        (space !== "default" && Boolean(parent?.preserveSpace)),
      location: opener,
    };
    if (parent) parent.content.push(element);
    else root = element;
    elements.push(element);
  });
  function addText(value: string) {
    const parent = elements.at(-1);
    if (!parent || !value) return;
    const last = parent.content.at(-1);
    if (last && "value" in last) last.value += value;
    else {
      if (++nodes > 100_000) fail("XML exceeds the 100,000-node limit.");
      parent.content.push({ value });
    }
  }
  parser.on("text", addText);
  parser.on("cdata", addText);
  parser.on("closetag", () => {
    const element = elements.pop();
    const parent = elements.at(-1);
    if (element && kind === "SOAP") {
      const text = element.content[0];
      const isFaultCode =
        (element.name === "faultcode" &&
          parent?.name === expandedName(soap11, "Fault")) ||
        (element.name === expandedName(soap12, "Value") &&
          (parent?.name === expandedName(soap12, "Code") ||
            parent?.name === expandedName(soap12, "Subcode")));
      if (
        isFaultCode &&
        element.content.length === 1 &&
        text &&
        "value" in text
      ) {
        const name = text.value.trim();
        const separator = name.indexOf(":");
        const prefix = separator < 0 ? "" : name.slice(0, separator);
        const uri = parser.resolve(prefix);
        if (uri !== undefined || !prefix)
          text.qualifiedValue = expandedName(
            uri ?? "",
            name.slice(separator + 1),
          );
      }
    }
    if (--depth === 0) {
      end = parser.position;
      if (mode === "prefix") throw endOfRoot;
    }
  });
  try {
    parser.write(text).close();
  } catch (error) {
    if (error !== endOfRoot) throw error;
  }
  return { end, kind, root };
}

// Embedded log payloads can have non-XML text after the root closing tag.
export function readXml(
  text: string,
): { end: number; kind: "XML" | "SOAP" } | undefined {
  try {
    const { end, kind } = scanXml(text, "prefix");
    return end ? { end, kind } : undefined;
  } catch {
    return undefined;
  }
}

export function parseXmlDocument(text: string): {
  kind: "XML" | "SOAP";
  root: XmlElement;
} {
  const { kind, root } = scanXml(text, "document");
  if (!root)
    throw new XmlParseError("Enter an XML document with a root element.", {
      line: 1,
      column: 1,
    });
  return { kind, root };
}
