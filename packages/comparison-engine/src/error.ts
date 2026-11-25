import type { SourceLocation } from "./model";

export class ComparisonError extends Error {
  constructor(
    message: string,
    readonly location?: SourceLocation,
  ) {
    super(message);
  }
}
