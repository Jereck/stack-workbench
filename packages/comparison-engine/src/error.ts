import type { RestrictedInputFormat, SourceLocation } from "./model";

export class ComparisonError extends Error {
  constructor(
    message: string,
    readonly location?: SourceLocation,
  ) {
    super(message);
  }
}

export class RestrictedFormatError extends ComparisonError {
  constructor(readonly format: RestrictedInputFormat) {
    super("This input format is unavailable in the current comparison.");
  }
}
