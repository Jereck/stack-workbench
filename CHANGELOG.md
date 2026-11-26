# Changelog

## Unreleased

- Enforced Log Inspector's 4 MiB UTF-8 cap before applying pastes or edits, including multiple-cursor edits. Rejected changes preserve the current input and results.
- Added opt-in release smoke tests for Firefox and WebKit alongside Chromium, covering keyboard workflows, local handoffs, downloads, and privacy.
- Connected Log Inspector and Integration Compare with a one-time, on-device transfer of decoded payloads and Pro log sessions.
- Added typed Free and Pro capabilities, a development-only simulator, and inline Pro availability details.
- Added recorded log-session comparison with transaction matching, explicit correlation-group pairs, manual overrides, and source-linked regression observations.
- Added cancellable batch runs, versioned local comparison profiles, and Markdown, JSON, CSV, and printable HTML reports with optional captured values and redaction.
- Added Integration Compare under Compare in the tool directory. The browser-local workspace supports two editable inputs, files and examples, aligned and structural views, a searchable difference explorer, and editable comparison rules.
- Added the Phase 3A Integration Compare engine and cancellable browser worker for JSON, XML and SOAP, text, HTTP, and supported logs.

- Redesigned the homepage and searchable tool directory around the available Log Inspector, with a real parsed preview of its synthetic example.
- Added a responsive workspace shell, local sidebar preference, compact Log Inspector input and filters, and a dedicated event inspector with keyboard navigation.
- Documented the shared light and dark design system and self-hosted Geist typography.

- Established the StackWorkbench monorepo, public site, typed tool directory, planned-tool pages, and local theme preference.
- Added the browser-local Log Inspector MVP with log parsing, payload and exception views, correlation search, and configurable redacted exports.
- Documented development setup, handoff, and the first-release backlog.
- Expanded CI to Linux, macOS, and Windows. Updated browser tests to use the platform's clipboard and undo shortcuts and made TypeScript's import casing check explicit.
- Aligned editor settings with Git's LF policy and clarified timestamp sorting in the Log Inspector guide.
