import { hasCapability } from "@stack-workbench/shared/entitlements";
import type {
  Capability,
  Entitlements,
} from "@stack-workbench/shared/entitlements";
import type {
  ComparisonConfiguration,
  ComparisonRule,
  InputFormat,
  RestrictedInputFormat,
} from "@stack-workbench/comparison-engine";

export const gatedFormats = {
  http: "compare.http",
  log: "compare.sessions",
} satisfies Record<RestrictedInputFormat, Capability>;

export function canUseFormat(access: Entitlements, format: InputFormat) {
  return (
    (format !== "http" && format !== "log") ||
    hasCapability(access, gatedFormats[format])
  );
}

export function blockedFormats(access: Entitlements): RestrictedInputFormat[] {
  return (Object.keys(gatedFormats) as RestrictedInputFormat[]).filter(
    (format) => !canUseFormat(access, format),
  );
}

export function canUseRuleKind(
  access: Entitlements,
  kind: ComparisonRule["kind"],
) {
  if (kind === "ignore-path") return true;
  return hasCapability(
    access,
    kind === "array" ? "compare.array-matching" : "compare.advanced-rules",
  );
}

export function canUseRule(access: Entitlements, rule: ComparisonRule) {
  if (
    rule.kind === "ignore-path" &&
    rule.path.split("/").some((segment) => segment === "*" || segment === "**")
  )
    return hasCapability(access, "compare.advanced-rules");
  return canUseRuleKind(access, rule.kind);
}

export function comparisonSettings(
  access: Entitlements,
  configuration: ComparisonConfiguration = {},
): ComparisonConfiguration {
  const rules = hasCapability(access, "compare.advanced-rules");
  const arrays = hasCapability(access, "compare.array-matching");
  return {
    includeUnchanged: configuration.includeUnchanged,
    mode: hasCapability(access, "compare.schema")
      ? configuration.mode
      : undefined,
    rules: configuration.rules?.filter((rule) => canUseRule(access, rule)),
    arrays: arrays ? configuration.arrays : undefined,
    json: rules ? configuration.json : undefined,
    xml:
      rules || arrays
        ? {
            normalizeWhitespace: rules
              ? configuration.xml?.normalizeWhitespace
              : undefined,
            soapScope: rules ? configuration.xml?.soapScope : undefined,
            identityAttributes: arrays
              ? configuration.xml?.identityAttributes
              : undefined,
          }
        : undefined,
    text: rules ? configuration.text : undefined,
  };
}

export const proFeatures = {
  "compare.advanced-rules": {
    title: "Advanced rules",
    description:
      "Use wildcard paths and tolerances, match array entries by identifier, and compare observed structure.",
  },
  "compare.array-matching": {
    title: "Advanced array matching",
    description:
      "Compare arrays without regard to order or match records by their identifiers.",
  },
  "compare.http": {
    title: "HTTP transaction comparison",
    description:
      "Compare HTTP start lines, headers, query parameters, and decoded bodies.",
  },
  "compare.sessions": {
    title: "Log session comparison",
    description:
      "Compare entire recorded sessions and trace changes to their source events.",
  },
  "compare.session-matching": {
    title: "Session and transaction matching",
    description:
      "Use correlation groups, configured identifiers, and manual transaction pairs.",
  },
  "compare.batch": {
    title: "Batch comparisons",
    description:
      "Run a queue of payload or HTTP pairs and inspect the evidence for each result.",
  },
  "compare.profiles": {
    title: "Saved comparison profiles",
    description:
      "Save rules and format choices in this browser and reuse them across comparisons.",
  },
  "compare.schema": {
    title: "Schema difference analysis",
    description: "Compare the observed structure and types across two inputs.",
  },
  "compare.reporting": {
    title: "Regression report",
    description:
      "Export comparison evidence in Markdown, JSON, CSV, or printable HTML with optional masking.",
  },
} satisfies Record<Capability, { title: string; description: string }>;
