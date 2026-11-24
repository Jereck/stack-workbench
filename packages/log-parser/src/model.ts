import type { Payload } from "@stack-workbench/payload-parser";

export const MAX_INPUT_BYTES = 4 * 1024 * 1024;
export const MAX_EVENTS = 20_000;
export const MAX_RESULT_PAYLOAD_LENGTH = 4 * 1024 * 1024;

export const formats = {
  auto: "Automatic detection",
  text: "Plain text / mixed",
  json: "JSON",
  ndjson: "JSON Lines / NDJSON",
  "serilog-json": "Serilog compact JSON",
  "serilog-text": "Serilog text",
  cloudwatch: "CloudWatch JSON",
} as const;

export type LogFormat = keyof typeof formats;
export const levels = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "unknown",
] as const;
export type LogLevel = (typeof levels)[number];

export interface LogTimestamp {
  original: string | number;
  offset?: string;
  utc?: string;
}

export interface LogException {
  type?: string;
  message?: string;
  stack?: string;
  cause?: LogException;
}

export interface LogEvent {
  index: number;
  timestamp?: LogTimestamp;
  level: LogLevel;
  message: string;
  source?: string;
  service?: string;
  logger?: string;
  exception?: LogException;
  properties?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  correlationId?: string;
  requestId?: string;
  httpMethod?: string;
  httpUrl?: string;
  httpStatus?: number;
  payloads: Payload[];
  raw: string;
  warnings: string[];
}

export interface LogResult {
  format: Exclude<LogFormat, "auto">;
  events: LogEvent[];
  summary: {
    levels: Record<LogLevel, number>;
    earliest?: LogTimestamp;
    latest?: LogTimestamp;
    payloads: number;
    exceptions: number;
    warnings: Record<string, number>;
  };
}
