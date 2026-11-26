# Known issues and limitations

## Log Inspector

- **The explorer sorts by timestamp but has no time-window control.** The pre-audit workflow guide mentioned timeline filters. The current guide reflects the shipped sort controls. Product intent for time-window filtering is tracked in the backlog.
- **Automated redaction is best effort.** Custom secret names, formats, and encodings may remain in exports. Heuristics can mask a whole text value. The raw-event clipboard action copies original content. Clearing application state leaves user-created clipboard and file copies on the device.
- **Format and scale limits are intentional.** Plain text parsing is heuristic. One UTF-8 file, built-in formats, and bounded extraction are the current scope. Streaming, compressed input, and arbitrary field aliases remain outside that scope. See [supported input and limits](../products/log-inspector.md).
- **Filtering and sorting run on the UI thread.** The existing benchmark measures parsing and first render on a Windows machine. It does not establish latency for repeated filtering, sorting, or export at the input cap.

## Integration Compare

- Session matching compares captured records. Repeated identifiers or multiple candidates need a more specific selector or a manual match. Batch keeps summary rows and regenerates full evidence for the inspected pair. Explorer search uses paths, rules, and bounded value previews. [Integration Compare scope and limits](../products/integration-compare.md)
- Cross-tool handoffs last for the current browser document. Refresh or opening another tab requires staging the inputs again. Production grants Free until the app can verify account entitlements. [Handoff and entitlements](../decisions/0006-tool-handoff-and-entitlements.md)

## Platform and release verification

- The feedback route reports that submissions are unavailable. It provides no form or delivery mechanism.
- The full browser suite targets Chromium. The release smoke suite also targets Firefox and WebKit. Native Safari and screen-reader verification remain open.
- The checked-in CSP restricts framing, base URLs, embedded objects, and form actions. It has no script or connection allowlist. The release host's headers, logging, and retention require review before a public release. [Privacy and security architecture](../architecture/privacy-and-security.md)
