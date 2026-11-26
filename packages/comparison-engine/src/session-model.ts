import type {
  Correlation,
  CorrelationGroup,
  LogEvent,
  LogResult,
} from "@stack-workbench/log-parser";
import type {
  ComparisonConfiguration,
  ComparisonInput,
  Difference,
  ParsingWarning,
  Side,
} from "./model";

export interface SessionSettings {
  includeService?: boolean;
  includeOperation?: boolean;
  /** Exact JSON Pointers into normalized event properties. */
  eventIdentifiers?: readonly string[];
  /** Exact JSON Pointers into the captured JSON request, or response when no request was captured. */
  payloadIdentifiers?: readonly string[];
}

export interface ManualTransactionMatch {
  baseline: number;
  target: number;
}

export interface SessionOptions {
  comparison?: ComparisonConfiguration;
  matching?: SessionSettings;
  groups?: Record<Side, Correlation>;
  overrides?: readonly ManualTransactionMatch[];
}

export interface SessionRequest {
  baseline: ComparisonInput;
  target: ComparisonInput;
  options?: SessionOptions;
}

export interface ObservedTransaction {
  id: number;
  events: readonly number[];
  requestEvent?: number;
  responseEvent?: number;
  method?: string;
  endpoint?: string;
  service?: string;
  operation?: string;
  status?: number;
  durationMs?: number;
  payloads: LogEvent["payloads"];
  identifiers?: readonly (string | number | boolean)[];
}

export interface SessionSide {
  format: LogResult["format"];
  summary: LogResult["summary"];
  events: readonly LogEvent[];
  groups: readonly CorrelationGroup[];
  transactions: readonly ObservedTransaction[];
  services: readonly string[];
}

export interface SessionMatch {
  baseline: number;
  target: number;
  reason: string;
}

export interface MatchIssue {
  kind:
    | "ambiguous"
    | "unmatched"
    | "missing-key"
    | "unlinked"
    | "override"
    | "payload";
  scope: "events" | "transactions";
  baseline: readonly number[];
  target: readonly number[];
  reason: string;
}

export interface SessionFinding {
  id: number;
  kind:
    | "severity"
    | "services"
    | "exception"
    | "status"
    | "request"
    | "response"
    | "payload"
    | "duration"
    | "ordering"
    | "event"
    | "operation";
  description: string;
  baselineEvents?: readonly number[];
  targetEvents?: readonly number[];
  difference?: Difference;
}

export interface RegressionObservation {
  message: string;
  evidence: readonly number[];
}

export type SessionResult =
  | { status: "failed"; message: string }
  | {
      status: "compared";
      baseline: SessionSide;
      target: SessionSide;
      eventMatches: readonly SessionMatch[];
      transactionMatches: readonly SessionMatch[];
      issues: readonly MatchIssue[];
      findings: readonly SessionFinding[];
      observations: readonly RegressionObservation[];
      parsingWarnings: readonly ParsingWarning[];
      omittedFindings: number;
    };
