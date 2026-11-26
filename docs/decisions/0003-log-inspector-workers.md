# ADR 0003 · Bound log processing and run it in browser workers

**Status** · Accepted

## Context

Log Inspector handles untrusted input that may include confidential application data. Even local parsing and export can block the UI when a log contains thousands of events or deeply escaped payloads.

## Decision

Keep normalized event and filtering logic, payload extraction, and redaction in three framework-independent workspace packages. The tool package owns the worker message protocol, UI state, and file and clipboard interaction. Bundle Monaco's plaintext editor and the workers with the web app and load them from the site origin.

Start a dedicated worker for each parse or export. The UI gets a structured result or local Blob and terminates the worker. Cancel and Clear terminate any active worker. In-memory results serve filtering and pagination directly, so an idle worker can release its duplicate data. Enforce limits on UTF-8 input size, records, payload scan work, nesting, and extracted output.

Enforce the parser's byte cap before applying editor changes. Use the model's complete edit batch to account for all cursor selections and replacements. Check original full-paste and file bytes separately. The editor uses LF on all platforms, and parsing preserves the received text until it is edited. Undo and redo restore previously admitted model versions.

Use a streaming XML parser with namespace awareness and reject document type declarations. Render generated views as text. Preserve raw event slices for inspection and apply configurable best-effort redaction to export copies.

## Consequences

Worker startup and result cloning contribute to time before the first page appears. The explorer limits rendering to 50 rows per page and renders the active event inspector view on demand. Parsing recovery can retain a record as raw text with a warning. [Limits and measured results](../products/log-inspector.md)
