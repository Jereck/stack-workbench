# ADR 0002 · Process sensitive tool input locally by default

**Status** · Accepted

## Context

Engineering data can contain credentials, personal data, customer identifiers, and internal infrastructure details. Manual tools can address many workflows entirely in a browser.

## Decision

Free manual tools process data in the browser whenever possible. Sensitive inputs stay in memory by default and are excluded from telemetry, diagnostics, and URLs. Any exception that transfers sensitive input requires explicit user authorization at the point of transfer.

## Consequences

Browser memory and CPU constrain the size and type of jobs. Benchmark representative synthetic inputs and use limits or workers when justified. Future server features need a documented data flow and user-facing authorization before handling sensitive input.
