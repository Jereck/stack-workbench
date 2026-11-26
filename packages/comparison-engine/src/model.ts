import type { LogFormat, LogResult } from "@stack-workbench/log-parser";
import type { XmlElement } from "@stack-workbench/payload-parser";
import type { SessionSettings } from "./session-model";

export const inputFormats = {
  auto: "Automatic detection",
  json: "JSON",
  xml: "XML",
  soap: "SOAP",
  text: "Plain text",
  http: "Raw HTTP",
  log: "Application logs",
} as const;

export type InputFormat = keyof typeof inputFormats;
export type RestrictedInputFormat = "http" | "log";
export type Side = "baseline" | "target";

export interface ComparisonInput {
  text: string;
  label?: string;
  format?: InputFormat;
  logFormat?: LogFormat;
  /** Duration explicitly recorded by the caller, in milliseconds. */
  recordedDurationMs?: number;
}

export type Baseline = ComparisonInput;
export type Target = ComparisonInput;
export type FieldPath = readonly (string | number)[];
export type ComparisonValue =
  | null
  | boolean
  | string
  | number
  | ComparisonObject
  | readonly ComparisonValue[];
export interface ComparisonObject {
  readonly [key: string]: ComparisonValue;
}

export type ArrayStrategy =
  | { kind: "positional" }
  | { kind: "unordered" }
  | { kind: "keyed"; keys: readonly string[] };

/** Rule paths are JSON Pointers extended with * and ** segment wildcards. */
export type ComparisonRule = {
  id: string;
  enabled: boolean;
} & (
  | { kind: "ignore-path"; path: string }
  | { kind: "ignore-property"; name: string }
  | { kind: "ignore-xml-element" | "ignore-xml-attribute"; name: string }
  | { kind: "ignore-http-header" | "ignore-query"; name: string }
  | { kind: "array"; path: string; strategy: ArrayStrategy }
  | { kind: "numeric-tolerance"; path: string; absolute: number }
  | { kind: "ignore-case" | "ignore-whitespace"; path: string }
);

export interface ComparisonConfiguration {
  rules?: readonly ComparisonRule[];
  arrays?: ArrayStrategy;
  mode?: "values" | "structure";
  includeUnchanged?: boolean;
  json?: { decodeEscaped?: boolean };
  xml?: {
    normalizeWhitespace?: boolean;
    soapScope?: "envelope" | "body";
    identityAttributes?: readonly string[];
  };
  text?: { normalizeWhitespace?: boolean; normalizeLineEndings?: boolean };
}

export interface ComparisonProfile {
  version: 1;
  name: string;
  description?: string;
  baselineFormat?: InputFormat;
  targetFormat?: InputFormat;
  configuration: ComparisonConfiguration;
  session?: SessionSettings;
}

export type DifferenceClassification =
  | "added"
  | "removed"
  | "modified"
  | "type-changed"
  | "unchanged"
  | "ignored"
  | "reordered"
  | "missing-match"
  | "ambiguous-match";

export interface SourceLocation {
  line: number;
  column?: number;
}

export interface Difference {
  path: FieldPath;
  /** Actual target path when matching pairs records at different locations. */
  targetPath?: FieldPath;
  classification: DifferenceClassification;
  baseline?: ComparisonValue;
  target?: ComparisonValue;
  baselineLocation?: SourceLocation;
  targetLocation?: SourceLocation;
  rule?: ComparisonRule;
  explanation?: string;
}

export interface ParsingWarning {
  side: Side;
  message: string;
  location?: SourceLocation;
  count?: number;
}

export interface MatchingWarning {
  path: FieldPath;
  kind: "missing-match" | "ambiguous-match";
  message: string;
  side?: Side;
}

export interface ComparisonStatistics {
  counts: Record<DifferenceClassification, number>;
  totalDifferences: number;
  matchingWarnings: number;
  omittedRows: number;
}

export type PayloadData =
  | { kind: "json"; value: ComparisonValue }
  | { kind: "xml" | "soap"; root: XmlElement }
  | { kind: "text"; text: string };

export interface HttpMessage {
  kind: "request" | "response";
  version: string;
  method?: string;
  address?: string;
  path?: string;
  query: Readonly<Record<string, readonly string[]>>;
  status?: number;
  headers: Readonly<Record<string, readonly string[]>>;
  body?: PayloadData;
  recordedDurationMs?: number;
}

export type InputData =
  | PayloadData
  | { kind: "http"; message: HttpMessage }
  | { kind: "log"; logs: LogResult; value: ComparisonValue };

export interface ParsedInput {
  input: ComparisonInput;
  data: InputData;
}

export interface ComparisonNotice {
  kind: "text-alignment-limit" | "result-limit" | "different-formats";
  message: string;
}

interface ParsedSides {
  inputs: { baseline: Baseline; target: Target };
  baseline?: ParsedInput;
  target?: ParsedInput;
  parsingWarnings: readonly ParsingWarning[];
}

export type ComparisonResult =
  | (ParsedSides & {
      status: "failed";
      errors: readonly {
        side?: Side;
        message: string;
        location?: SourceLocation;
        restrictedFormat?: RestrictedInputFormat;
      }[];
    })
  | (ParsedSides & {
      status: "compared";
      baseline: ParsedInput;
      target: ParsedInput;
      equivalent: boolean;
      differences: readonly Difference[];
      statistics: ComparisonStatistics;
      matchingWarnings: readonly MatchingWarning[];
      notices: readonly ComparisonNotice[];
      text?: TextComparison;
    });

export interface TextLine {
  number: number;
  text: string;
  ending: string;
}

export interface TextRow {
  baseline?: TextLine;
  target?: TextLine;
  classification: "added" | "removed" | "modified" | "unchanged" | "ignored";
}

export interface TextComparison {
  rows: readonly TextRow[];
  exactAlignment: boolean;
}
