import { ComparisonError } from "./error";
import type {
  ArrayStrategy,
  ComparisonConfiguration,
  ComparisonRule,
  FieldPath,
} from "./model";

export type FieldKind =
  "property" | "xml-element" | "xml-attribute" | "http-header" | "query";

export interface Field {
  kind: FieldKind;
  name: string;
  localName?: string;
}

const one = Symbol();
const many = Symbol();
type Token = string | typeof one | typeof many;
type CompiledRule = { rule: ComparisonRule; pattern: Token[] };
const maxTokenVisits = 4_000_000;

export function formatFieldPath(path: FieldPath): string {
  return path
    .map(
      (segment) =>
        "/" +
        String(segment)
          .replaceAll("~", "~0")
          .replaceAll("/", "~1")
          .replaceAll("*", "~2"),
    )
    .join("");
}

function compilePath(path: string): Token[] {
  if (path === "") return [];
  if (path.length > 2048 || !path.startsWith("/"))
    throw new ComparisonError(
      "Enter a rule path as a JSON Pointer starting with /. Use an empty path for the root.",
    );
  const tokens = path.slice(1).split("/");
  if (tokens.length > 160 || tokens.some((token) => /~(?![012])/.test(token)))
    throw new ComparisonError(
      "The rule path has too many segments or an invalid escape.",
    );
  return tokens.map((token) =>
    token === "*"
      ? one
      : token === "**"
        ? many
        : token
            .replaceAll("~2", "*")
            .replaceAll("~1", "/")
            .replaceAll("~0", "~"),
  );
}

function matches(pattern: Token[], path: FieldPath, step: () => void): boolean {
  // Backtrack only to the most recent globstar. Other segments consume one item.
  let index = 0;
  let part = 0;
  let wildcard = -1;
  let start = 0;
  while (index < path.length) {
    step();
    const token = pattern[part];
    if (token === many) {
      wildcard = part++;
      start = index;
    } else if (token === one || token === String(path[index])) {
      index++;
      part++;
    } else if (wildcard >= 0) {
      part = wildcard + 1;
      index = ++start;
    } else return false;
  }
  while (pattern[part] === many) part++;
  return part === pattern.length;
}

function checkNames(names: readonly string[] | undefined) {
  if (
    names &&
    (names.length > 8 ||
      names.some((name) => name.length > 2048) ||
      new Set(names).size !== names.length)
  )
    throw new ComparisonError(
      "Use up to eight distinct identifier fields with valid lengths.",
    );
}

function checkStrategy(strategy: ArrayStrategy | undefined) {
  if (strategy?.kind !== "keyed") return;
  if (!strategy.keys.length)
    throw new ComparisonError(
      "Select at least one identifier field for keyed arrays.",
    );
  checkNames(strategy.keys);
}

export class Rules {
  private readonly paths = new Map<ComparisonRule["kind"], CompiledRule[]>();
  private readonly names = new Map<FieldKind, Map<string, ComparisonRule>>();
  private tokenVisits = 0;
  private readonly step = () => {
    if (++this.tokenVisits > maxTokenVisits)
      throw new ComparisonError(
        "Rule matching exceeds the work limit. Simplify the rules or compare a smaller excerpt.",
      );
  };

  constructor(config: ComparisonConfiguration) {
    const rules = config.rules ?? [];
    if (rules.length > 64)
      throw new ComparisonError("A comparison can use at most 64 rules.");
    checkStrategy(config.arrays);
    checkNames(config.xml?.identityAttributes);
    const ids = new Set<string>();
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (!rule.id.trim() || ids.has(rule.id))
        throw new ComparisonError(
          "Give each enabled comparison rule a distinct ID.",
        );
      ids.add(rule.id);
      if (rule.kind === "array") checkStrategy(rule.strategy);
      if (
        rule.kind === "numeric-tolerance" &&
        (!Number.isFinite(rule.absolute) || rule.absolute < 0)
      )
        throw new ComparisonError(
          "Numeric tolerance must be finite and nonnegative.",
        );
      if ("path" in rule) {
        if (!this.paths.has(rule.kind)) this.paths.set(rule.kind, []);
        this.paths
          .get(rule.kind)
          ?.push({ rule, pattern: compilePath(rule.path) });
      } else {
        const kind = rule.kind.slice("ignore-".length) as FieldKind;
        const name =
          kind === "http-header" ? rule.name.trim().toLowerCase() : rule.name;
        if (!this.names.has(kind)) this.names.set(kind, new Map());
        this.names.get(kind)?.set(name, rule);
      }
    }
  }

  find<K extends ComparisonRule["kind"]>(
    kind: K,
    path: FieldPath,
  ): (ComparisonRule & { kind: K }) | undefined {
    const rules = this.paths.get(kind);
    if (!rules) return;
    for (let index = rules.length - 1; index >= 0; index--) {
      const item = rules[index];
      if (item && matches(item.pattern, path, this.step))
        return item.rule as ComparisonRule & { kind: K };
    }
  }

  ignored(path: FieldPath, field?: Field): ComparisonRule | undefined {
    const byPath = this.find("ignore-path", path);
    if (byPath || !field) return byPath;
    const names = this.names.get(field.kind);
    return (
      names?.get(field.name) ??
      (field.localName !== undefined ? names?.get(field.localName) : undefined)
    );
  }

  affectsUnorderedEquality(path: FieldPath) {
    if (this.names.has("property")) return true;
    for (const rules of this.paths.values()) {
      for (const { pattern } of rules) {
        if (pattern.includes(many)) return true;
        if (
          pattern.length > path.length &&
          path.every(
            (segment, index) =>
              pattern[index] === one || pattern[index] === String(segment),
          )
        )
          return true;
      }
    }
    return false;
  }
}

export const rulePresets: readonly {
  name: string;
  rules: readonly ComparisonRule[];
}[] = [
  {
    name: "HTTP tracing headers",
    rules: [
      "traceparent",
      "tracestate",
      "x-correlation-id",
      "x-request-id",
    ].map((name) => ({
      id: "http-" + name,
      kind: "ignore-http-header",
      name,
      enabled: true,
    })),
  },
  {
    name: "Root request and correlation IDs",
    rules: ["requestId", "correlationId"].map((name) => ({
      id: "root-" + name,
      kind: "ignore-path",
      path: "/" + name,
      enabled: true,
    })),
  },
];
