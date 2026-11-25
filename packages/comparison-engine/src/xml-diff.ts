import { ComparisonError } from "./error";
import { isSoapNamespace } from "@stack-workbench/payload-parser";
import type { XmlElement, XmlText } from "@stack-workbench/payload-parser";
import type { Differences } from "./differences";
import { matchGroups } from "./matching";
import type {
  ComparisonConfiguration,
  ComparisonValue,
  FieldPath,
} from "./model";

type XmlNode = XmlElement | XmlText;
const isElement = (node: XmlNode): node is XmlElement => "name" in node;
const blank = /^[\t\n\r ]*$/;
const normalize = (text: string) =>
  text.replace(/[\t\n\r ]+/g, " ").replace(/^ | $/g, "");

function contentOf(element: XmlElement) {
  if (
    !element.preserveSpace &&
    element.content.some(isElement) &&
    element.content.every((node) => isElement(node) || blank.test(node.value))
  )
    return element.content.filter(isElement);
  return element.content;
}

function semanticText(
  node: XmlText,
  element: XmlElement,
  config: ComparisonConfiguration,
) {
  if (node.qualifiedValue !== undefined) return node.qualifiedValue;
  return config.xml?.normalizeWhitespace && !element.preserveSpace
    ? normalize(node.value)
    : node.value;
}

function snapshot(
  element: XmlElement,
  config: ComparisonConfiguration,
  semantic: boolean,
): ComparisonValue {
  return {
    name: element.name,
    attributes: element.attributes,
    content: contentOf(element).map((node) =>
      isElement(node)
        ? snapshot(node, config, semantic)
        : semantic
          ? semanticText(node, element, config)
          : node.value,
    ),
  };
}

export function xmlValue(element: XmlElement): ComparisonValue {
  return snapshot(element, {}, false);
}

function nameOf(node: XmlNode) {
  return isElement(node) ? node.name : "#text";
}

function childPaths(nodes: readonly XmlNode[]) {
  const count = new Map<string, number>();
  return nodes.map((node) => {
    const name = nameOf(node);
    const index = count.get(name) ?? 0;
    count.set(name, index + 1);
    return [name, index] as const;
  });
}

function body(root: XmlElement) {
  const bodies = root.content
    .filter(isElement)
    .filter(
      (child) => child.local === "Body" && child.namespace === root.namespace,
    );
  if (bodies.length !== 1 || !bodies[0])
    throw new ComparisonError(
      "SOAP body comparison requires exactly one Body element in each envelope.",
    );
  return bodies[0];
}

export function compareXml(
  diff: Differences,
  left: XmlElement,
  right: XmlElement,
  path: FieldPath,
) {
  if (
    diff.config.xml?.soapScope === "body" &&
    isSoapNamespace(left.namespace) &&
    isSoapNamespace(right.namespace) &&
    left.local === "Envelope" &&
    right.local === "Envelope"
  ) {
    left = body(left);
    right = body(right);
  }
  if (left.name === right.name) visit(diff, left, right, [...path, left.name]);
  else {
    visit(diff, left, undefined, [...path, left.name]);
    visit(diff, undefined, right, [...path, right.name]);
  }
}

function visit(
  diff: Differences,
  baseline: XmlElement | undefined,
  target: XmlElement | undefined,
  path: FieldPath,
) {
  diff.step();
  const element = baseline ?? target;
  if (!element) return;
  const rule = diff.rules.ignored(path, {
    kind: "xml-element",
    name: element.name,
    localName: element.local,
  });
  const locations = {
    baselineLocation: baseline?.location,
    targetLocation: target?.location,
  };
  if (rule || !baseline || !target) {
    if (
      rule &&
      baseline &&
      target &&
      diff.equalExact(
        snapshot(baseline, diff.config, true),
        snapshot(target, diff.config, true),
      )
    )
      return;
    diff.write({
      path,
      ...locations,
      baseline: baseline && xmlValue(baseline),
      target: target && xmlValue(target),
      classification: rule ? "ignored" : baseline ? "removed" : "added",
      explanation: rule ? "Excluded by the selected rule." : undefined,
      rule,
    });
    return;
  }
  const attributes = new Set(
    [
      ...Object.keys(baseline.attributes),
      ...Object.keys(target.attributes),
    ].sort(),
  );
  for (const name of attributes) {
    const attributePath = [...path, "@attributes", name];
    const left = Object.hasOwn(baseline.attributes, name)
      ? baseline.attributes[name]
      : undefined;
    const right = Object.hasOwn(target.attributes, name)
      ? target.attributes[name]
      : undefined;
    const excluded = diff.rules.ignored(attributePath, {
      kind: "xml-attribute",
      name,
      localName: name.startsWith("{")
        ? name.slice(name.lastIndexOf("}") + 1)
        : name,
    });
    if (excluded) {
      if (left !== right)
        diff.write({
          path: attributePath,
          baseline: left,
          target: right,
          ...locations,
          classification: "ignored",
          rule: excluded,
          explanation: "Excluded by the selected rule.",
        });
    } else compareLeaf(diff, attributePath, left, right, locations);
  }
  compareContent(diff, baseline, target, path);
  if (
    !attributes.size &&
    !baseline.content.length &&
    !target.content.length &&
    diff.config.includeUnchanged
  )
    diff.write({
      path,
      ...locations,
      classification: "unchanged",
      baseline: xmlValue(baseline),
      target: xmlValue(target),
    });
}

function compareLeaf(
  diff: Differences,
  path: FieldPath,
  baseline: string | undefined,
  target: string | undefined,
  locations: {
    baselineLocation?: XmlElement["location"];
    targetLocation?: XmlElement["location"];
  },
  left = baseline,
  right = target,
) {
  diff.step();
  const rule = diff.rules.ignored(path);
  const context = { path, baseline, target, ...locations };
  if (left === right) {
    if (diff.config.includeUnchanged && !rule)
      diff.write({ ...context, classification: "unchanged" });
  } else if (rule) {
    diff.write({
      ...context,
      classification: "ignored",
      rule,
      explanation: "Excluded by the selected rule.",
    });
  } else if (left === undefined || right === undefined) {
    diff.write({
      ...context,
      classification: left === undefined ? "added" : "removed",
    });
  } else if (diff.config.mode !== "structure") {
    const normalized = diff.normalization(left, right, path);
    diff.write(
      normalized
        ? { ...context, ...normalized, classification: "ignored" }
        : { ...context, classification: "modified" },
    );
  }
}

function compareContent(
  diff: Differences,
  baseline: XmlElement,
  target: XmlElement,
  path: FieldPath,
) {
  const left = contentOf(baseline);
  const right = contentOf(target);
  const leftPaths = childPaths(left);
  const rightPaths = childPaths(right);
  const keys = diff.config.xml?.identityAttributes ?? [];
  const keyedNames = new Set<string>();
  if (keys.length) {
    for (const nodes of [left, right]) {
      for (const node of nodes)
        if (
          isElement(node) &&
          keys.some((key) => Object.hasOwn(node.attributes, key))
        )
          keyedNames.add(node.name);
    }
  }
  const keyed = (node: XmlNode) => isElement(node) && keyedNames.has(node.name);
  function identity(node: XmlNode) {
    if (!isElement(node)) return nameOf(node);
    const values = keys.map((key) =>
      Object.hasOwn(node.attributes, key) ? node.attributes[key] : undefined,
    );
    return values.includes(undefined)
      ? undefined
      : JSON.stringify([node.name, ...values]);
  }
  const pairs = keyedNames.size
    ? [
        ...matchGroups(left.filter(keyed), right.filter(keyed), identity, true),
        ...matchGroups(
          left.filter((node) => !keyed(node)),
          right.filter((node) => !keyed(node)),
          nameOf,
          false,
        ),
      ]
    : matchGroups(left, right, nameOf, false);
  const indexed = (nodes: XmlNode[]) =>
    new Map(nodes.map((node, index) => [node, index]));
  const leftIndex = indexed(left);
  const rightIndex = indexed(right);
  const order: { baseline: number; target: number; label: string }[] = [];
  for (const pair of pairs) {
    const a = pair.baseline?.value;
    const b = pair.target?.value;
    const aIndex = a && leftIndex.get(a);
    const bIndex = b && rightIndex.get(b);
    const segment =
      aIndex !== undefined
        ? leftPaths[aIndex]
        : bIndex !== undefined
          ? rightPaths[bIndex]
          : undefined;
    if (!segment) continue;
    const childPath = [...path, ...segment];
    const element = a && isElement(a) ? a : b && isElement(b) ? b : undefined;
    const ignored = diff.rules.ignored(
      childPath,
      element && {
        kind: "xml-element",
        name: element.name,
        localName: element.local,
      },
    );
    if (pair.issue && !ignored) {
      const kind =
        pair.issue === "missing-key" ? "missing-match" : "ambiguous-match";
      const message =
        pair.issue === "missing-key"
          ? "The element lacks one or more selected identifier attributes."
          : "An element identifier is duplicated. No elements were paired for it.";
      diff.warn(childPath, kind, message, a ? "baseline" : "target");
      diff.write({
        path: childPath,
        classification: kind,
        explanation: message,
        baseline: a && isElement(a) ? xmlValue(a) : undefined,
        target: b && isElement(b) ? xmlValue(b) : undefined,
        baselineLocation: a && isElement(a) ? a.location : undefined,
        targetLocation: b && isElement(b) ? b.location : undefined,
      });
      continue;
    }
    if (aIndex !== undefined && bIndex !== undefined && !ignored)
      order.push({
        baseline: aIndex,
        target: bIndex,
        label: segment[0] + "[" + segment[1] + "]",
      });
    if (element)
      visit(
        diff,
        a && isElement(a) ? a : undefined,
        b && isElement(b) ? b : undefined,
        childPath,
      );
    else {
      const aText = a && !isElement(a) ? a : undefined;
      const bText = b && !isElement(b) ? b : undefined;
      compareLeaf(
        diff,
        childPath,
        aText?.value,
        bText?.value,
        {
          baselineLocation: aText && baseline.location,
          targetLocation: bText && target.location,
        },
        aText && semanticText(aText, baseline, diff.config),
        bText && semanticText(bText, target, diff.config),
      );
    }
  }
  order.sort((a, b) => a.baseline - b.baseline);
  if (
    order.some(
      (entry, index) =>
        index > 0 && entry.target < (order[index - 1]?.target ?? 0),
    )
  ) {
    const baselineOrder = order.map(({ label }) => label);
    const targetOrder = order
      .sort((a, b) => a.target - b.target)
      .map(({ label }) => label);
    const orderPath = [...path, "#order"];
    const rule = diff.rules.ignored(orderPath);
    diff.write({
      path: orderPath,
      baseline: baselineOrder,
      target: targetOrder,
      baselineLocation: baseline.location,
      targetLocation: target.location,
      classification: rule ? "ignored" : "reordered",
      rule,
      explanation: rule
        ? "Excluded by the selected rule."
        : "The order of matched child nodes changed.",
    });
  }
}
