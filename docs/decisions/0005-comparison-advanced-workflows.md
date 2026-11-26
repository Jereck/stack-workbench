# ADR 0005 · Use recorded evidence and settings-only profiles

**Status** · Accepted

## Context

Session inputs can contain partial HTTP exchanges, unrelated events, and repeated endpoints. Batch comparisons can generate more decoded data than the browser needs to retain. Profiles and reports have different privacy and lifetime requirements.

## Decision

Reuse normalized Log Inspector records. Scope correlation groups to their source session. Require a unique candidate on each side for automatic matching. Reserve explicit manual pairs before matching the remaining transactions. Link regression observations to retained findings and source event numbers.

Run a single batch worker at a time and retain summary counts. Recompute an inspected pair with the batch’s settings snapshot. Validate versioned profiles against an explicit field schema and write only settings the user saves or imports to browser storage. Keep recorded data, selected correlation groups, manual pairs, and results in memory.

Generate report downloads in a worker using explicit captured-value and redaction options. Use the shared redaction engine with original field paths to mask detached scalar evidence. Escape printable HTML, restrict its resources, and protect CSV cells against spreadsheet formulas.

## Consequences

Ambiguous matches remain visible and can be resolved using domain-specific identifiers or direct pairs. Batch inspection spends additional worker time to keep retained evidence bounded. Profile and report contents stay under user control. [Workflow and limits](../products/integration-compare.md)
