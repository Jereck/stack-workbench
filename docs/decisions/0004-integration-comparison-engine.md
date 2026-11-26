# ADR 0004 · Separate comparison semantics from the browser workspace

**Status** · Accepted

## Context

Integration Compare must compare multiple recorded formats deterministically and keep sensitive inputs local. The existing payload and log parsers already define bounded JSON reads, XML namespace and DTD handling, and the normalized log model.

## Decision

Put the comparison model, rules, format adapters, matching, and results in `packages/comparison-engine`. Reuse the log parser and add full-document parsing to the existing XML parser alongside its prefix mode for embedded payloads. Keep both parser roles under the same namespace-aware, DTD-rejecting scanner. Store raw input and parsed representations alongside comparison evidence in memory.

The independent tool package owns the worker message contract and starts one dedicated worker per job. A successful result, cancellation, or transport failure releases that worker. The web app mounts the tool through the shared workspace shell and owns registry metadata.

Match structured data by type and path. When users select identifiers, require unique candidates and show missing and ambiguous matches. Use the baseline path for rules and attach the actual target path to relocated matches so the structure view can mark the correct node. Use bounded alignment work, explicit failures and notices, and separate counts from retained row limits.

## Consequences

Engine behavior can be tested and benchmarked before a route exists. A browser worker fixture checks interoperability, privacy, and lifecycle separately from the Next.js workspace. The workspace should render retained rows on demand and handle failure, cancellation, and omission notices. Session matching, profile storage, and commercial entitlements can consume the model without turning the comparison engine into an application service.
