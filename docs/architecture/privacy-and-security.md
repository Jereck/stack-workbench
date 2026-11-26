# Privacy and security

## Site data flow

The browser loads same-origin pages and assets. StackWorkbench has no analytics or session recording. On first visit the site follows the system color mode. A changed theme can be saved locally under `stack-workbench-theme`. Toggling the workspace sidebar can save `expanded` or `collapsed` under `stack-workbench-sidebar`. The homepage preview parses a bundled synthetic fixture during page generation. The preview entry point accepts no user input.

The web server sets a no-referrer policy, disables MIME sniffing, and sets a content security policy limiting framing, base URIs, embedded objects, and form destinations. Before adding a hosted service, review its request logging and retention and evaluate a script policy compatible with Next.js and the chosen hosting model.

## Log Inspector data flow

The browser loads the local editor and worker assets from the site origin. The editor and file reader keep input in memory. A dedicated browser worker produces normalized events from the input. A separate operation generates an export from selected or filtered results and returns a local Blob. Untrusted strings render as text and XML parsing rejects document type declarations. Clearing the workspace resets the editor and its undo history, releases derived state, and stops the current operation. Explicit copy and download actions create user-controlled copies. [Log Inspector product guide](../products/log-inspector.md)

The production browser test exercises pasted logs containing a synthetic marker, a log-controlled URL, and an XML document type declaration. It checks request URLs, headers and bodies, WebSocket traffic, and local and session storage.

## Integration Compare data flow

The workspace reads local files in browser memory and passes each pair into a dedicated worker through structured browser messages. Completion or cancellation terminates the worker. Clear releases input, results, and editor undo history across comparison modes. XML document parsing rejects DTDs. The workspace renders HTTP addresses and markup as text. Local storage holds the selected result view and explicitly saved, validated settings profiles. Profile fields can contain sensitive user-entered strings, so the workspace explains their scope before saving. Reports are built in a worker and downloaded locally. Printable reports block network resources. Browser tests exercise same-origin requests and check synthetic markers against traffic, console output, and storage. [Integration Compare product guide](../products/integration-compare.md)

Explicit handoff commands stage a copy in app-owned memory for the current browser document. The destination consumes the inbox once and releases the intermediate copy. Refresh and the source clear actions discard pending data. Browser tests check that transfers leave URLs, history state, request data, console output, and persistent storage free of synthetic input. [ADR 0006](../decisions/0006-tool-handoff-and-entitlements.md)

## Requirements for tools

- Free workflows should read and process data in the browser whenever possible. Use in-memory state by default, release input references on reset, and move CPU-intensive work to a browser worker if measurements warrant it.
- Ask for explicit authorization before transmitting raw logs, credentials, payloads, configuration, or derived data that could reveal their contents. Describe what would be sent, where it would go, and how it would be handled.
- Exclude sensitive input from URLs, network diagnostics, console output, telemetry, error reports, and default persistence. Review dependencies for automatic instrumentation and remote requests. Avoid third-party analytics and session recording.
- Treat every byte of user input as untrusted. Render it as escaped text, validate formats, and bound parsing and rendering work. Use generic error details in diagnostics and show actionable feedback locally.
- Keep secrets out of source, fixtures, samples, build output, and client-side environment variables. Use synthetic data or licensed public fixtures with documented provenance.
- Verify privacy by checking browser requests and storage while exercising real input flows with synthetic data. Include malformed and oversized input cases when appropriate.
