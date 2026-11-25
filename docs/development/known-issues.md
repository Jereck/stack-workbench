# Known issues and limitations

## Log Inspector

- **Editor admission is weaker than the parser limit.** The paste handler counts UTF-16 code units and adds the clipboard length once. UTF-8 multibyte contents and pastes into multiple selections can exceed that estimate. Repeated edits can also grow the model. Parsing enforces the 4 MiB UTF-8 limit, but the editor can hold oversized input before Parse. File admission checks bytes up front.
- **The explorer sorts by timestamp but has no time-window control.** The pre-audit workflow guide mentioned timeline filters. The current guide reflects the shipped sort controls. Product intent for time-window filtering is tracked in the backlog.
- **Automated redaction is best effort.** Custom secret names, formats, and encodings may remain in exports. Heuristics can mask a whole text value. The raw-event clipboard action copies original content. Clearing application state leaves user-created clipboard and file copies on the device.
- **Format and scale limits are intentional.** Plain text parsing is heuristic. One UTF-8 file, built-in formats, and bounded extraction are the current scope. Streaming, compressed input, and arbitrary field aliases remain outside that scope. See [supported input and limits](../products/log-inspector.md).
- **Filtering and sorting run on the UI thread.** The existing benchmark measures parsing and first render on a Windows machine. It does not establish latency for repeated filtering, sorting, or export at the input cap.

## Platform and release verification

- Integration Compare has a tested engine and worker. The real route, workspace, and production integration remain pending. The engine benchmark covers a standalone bundled fixture. [Integration Compare scope and engine limits](../products/integration-compare.md)

- The feedback route reports that submissions are unavailable. It provides no form or delivery mechanism.
- Current browser automation targets Chromium. Coverage for Safari and Firefox remains open.
- The checked-in CSP restricts framing, base URLs, embedded objects, and form actions. It has no script or connection allowlist. The release host's headers, logging, and retention require review before a public release. [Privacy and security architecture](../architecture/privacy-and-security.md)
