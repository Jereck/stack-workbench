import { isRecord, parseBoundedJson } from "@stack-workbench/payload-parser";
import { inputFormats } from "./model";
import type {
  ArrayStrategy,
  ComparisonConfiguration,
  ComparisonProfile,
  ComparisonRule,
  InputFormat,
} from "./model";
import { validateComparisonConfiguration } from "./rules";
import { validIdentifierPaths } from "./session-matching";
import type { SessionSettings } from "./session-model";

export const MAX_PROFILE_BYTES = 65_536;

function invalid(): never {
  throw new Error(
    "Invalid comparison profile. Use a version 1 settings file with supported fields and rules.",
  );
}

function record(value: unknown, keys: readonly string[]) {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key)))
    invalid();
  return value;
}

function string(value: unknown, length: number) {
  if (typeof value !== "string" || value.length > length) invalid();
  return value;
}

function boolean(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) invalid();
  return value as T;
}

function optional<T>(value: unknown, parse: (value: unknown) => T) {
  return value === undefined ? undefined : parse(value);
}

function strings(value: unknown, limit: number, length: number) {
  if (!Array.isArray(value) || value.length > limit) invalid();
  return value.map((item) => string(item, length));
}

function array(value: unknown): ArrayStrategy {
  const { kind, keys } = record(value, ["kind", "keys"]);
  const mode = choice(kind, ["positional", "unordered", "keyed"]);
  if (mode === "keyed") return { kind: mode, keys: strings(keys, 8, 2048) };
  if (keys !== undefined) invalid();
  return { kind: mode };
}

const nameRules = [
  "ignore-property",
  "ignore-xml-element",
  "ignore-xml-attribute",
  "ignore-http-header",
  "ignore-query",
] as const;
const pathRules = ["ignore-path", "ignore-case", "ignore-whitespace"] as const;

function rule(value: unknown): ComparisonRule {
  if (!isRecord(value)) invalid();
  const base = { id: string(value.id, 100), enabled: boolean(value.enabled) };
  const keys = ["id", "enabled", "kind"];
  if (value.kind === "array") {
    const entry = record(value, [...keys, "path", "strategy"]);
    return {
      ...base,
      kind: "array",
      path: string(entry.path, 2048),
      strategy: array(entry.strategy),
    };
  }
  if (value.kind === "numeric-tolerance") {
    const entry = record(value, [...keys, "path", "absolute"]);
    if (
      typeof entry.absolute !== "number" ||
      !Number.isFinite(entry.absolute) ||
      entry.absolute < 0
    )
      invalid();
    return {
      ...base,
      kind: "numeric-tolerance",
      path: string(entry.path, 2048),
      absolute: entry.absolute,
    };
  }
  if (nameRules.some((kind) => kind === value.kind)) {
    const entry = record(value, [...keys, "name"]);
    return {
      ...base,
      kind: choice(entry.kind, nameRules),
      name: string(entry.name, 2048),
    };
  }
  const entry = record(value, [...keys, "path"]);
  return {
    ...base,
    kind: choice(entry.kind, pathRules),
    path: string(entry.path, 2048),
  };
}

function configuration(value: unknown): ComparisonConfiguration {
  const input = record(value, [
    "rules",
    "arrays",
    "mode",
    "json",
    "xml",
    "text",
  ]);
  const settings: ComparisonConfiguration = {
    mode: optional(input.mode, (value) =>
      choice(value, ["values", "structure"]),
    ),
    arrays: optional(input.arrays, array),
    rules: optional(input.rules, (value) => {
      if (!Array.isArray(value) || value.length > 64) invalid();
      return value.map(rule);
    }),
    json: optional(input.json, (value) => ({
      decodeEscaped: optional(
        record(value, ["decodeEscaped"]).decodeEscaped,
        boolean,
      ),
    })),
    xml: optional(input.xml, (value) => {
      const input = record(value, [
        "normalizeWhitespace",
        "soapScope",
        "identityAttributes",
      ]);
      return {
        normalizeWhitespace: optional(input.normalizeWhitespace, boolean),
        soapScope: optional(input.soapScope, (value) =>
          choice(value, ["envelope", "body"]),
        ),
        identityAttributes: optional(input.identityAttributes, (value) =>
          strings(value, 8, 2048),
        ),
      };
    }),
    text: optional(input.text, (value) => {
      const input = record(value, [
        "normalizeWhitespace",
        "normalizeLineEndings",
      ]);
      return {
        normalizeWhitespace: optional(input.normalizeWhitespace, boolean),
        normalizeLineEndings: optional(input.normalizeLineEndings, boolean),
      };
    }),
  };
  if (
    validateComparisonConfiguration({
      ...settings,
      rules: settings.rules?.map((rule) => ({ ...rule, enabled: true })),
    })
  )
    invalid();
  return settings;
}

function matchSettings(value: unknown): SessionSettings {
  const input = record(value, [
    "includeService",
    "includeOperation",
    "eventIdentifiers",
    "payloadIdentifiers",
  ]);
  function pointers(value: unknown) {
    const paths = strings(value, 8, 256);
    if (!validIdentifierPaths(paths)) invalid();
    return paths;
  }
  return {
    includeService: optional(input.includeService, boolean),
    includeOperation: optional(input.includeOperation, boolean),
    eventIdentifiers: optional(input.eventIdentifiers, pointers),
    payloadIdentifiers: optional(input.payloadIdentifiers, pointers),
  };
}

export function readComparisonProfile(value: unknown): ComparisonProfile {
  const input = record(value, [
    "version",
    "name",
    "description",
    "baselineFormat",
    "targetFormat",
    "configuration",
    "session",
  ]);
  if (input.version !== 1) invalid();
  const name = string(input.name, 80).trim();
  if (!name) invalid();
  const format = (value: unknown) =>
    choice(value, Object.keys(inputFormats) as InputFormat[]);
  return {
    version: 1,
    name,
    description: optional(input.description, (value) => string(value, 500)),
    baselineFormat: optional(input.baselineFormat, format),
    targetFormat: optional(input.targetFormat, format),
    configuration: configuration(input.configuration),
    session: optional(input.session, matchSettings),
  };
}

export function parseComparisonProfile(text: string): ComparisonProfile {
  if (
    text.length > MAX_PROFILE_BYTES ||
    new TextEncoder().encode(text).length > MAX_PROFILE_BYTES
  )
    throw new Error("Profile files must be 64 KiB or smaller.");
  let value: unknown;
  try {
    value = parseBoundedJson(text);
  } catch {
    invalid();
  }
  return readComparisonProfile(value);
}

export function serializeComparisonProfile(profile: ComparisonProfile): string {
  const text = JSON.stringify(readComparisonProfile(profile), null, 2) + "\n";
  if (new TextEncoder().encode(text).length > MAX_PROFILE_BYTES)
    throw new Error(
      "The profile exceeds 64 KiB. Remove some rules before saving.",
    );
  return text;
}
