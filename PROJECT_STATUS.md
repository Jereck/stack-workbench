# Project status

**Current phase** · Phase 1 Log Inspector MVP release hardening. The public site and Log Inspector workspace have been redesigned. Public release readiness remains pending.

**Redesign baseline** · Clean `feature/design-system` at `5988436` on 2026-11-24. The checked-in Log Inspector spec, architecture docs, and accepted ADRs define the scope.

## Implemented and partial work

| Area                        | Status                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 platform foundation | Implemented site shell, homepage, tool directory, route metadata, planned-tool pages, 404, About and Privacy pages, theme preference, CI and workspace tests. Feedback is informational and accepts no submissions.                                                                                |
| Phase 1 input and parsing   | Implemented Monaco paste/edit, single local file and drop, examples, cancellation, detection and override, and malformed record recovery. Supports text/mixed, JSON/NDJSON, Serilog, and CloudWatch within the documented formats. File and parser limits exist. Editor admission remains partial. |
| Phase 1 exploration         | Implemented summary, warnings, severity and text search, ID filtering and correlation groups, timestamp sorting, pagination, raw and normalized details, exceptions, and embedded JSON/XML/SOAP inspection. A time-window filter is absent.                                                        |
| Phase 1 export and privacy  | Implemented selected and filtered JSON/text downloads with default configurable masking, raw copy, same-origin workers, and Clear with undo reset. Masking is best effort. Release hosting has yet to be verified.                                                                                 |

The homepage uses a preview derived from the bundled synthetic sample. The directory searches the registry and lists available tools by category. At `/tools/log-inspector`, the app shell groups tools in a collapsible sidebar, and the tool keeps event details in an adjacent inspector on desktop. The current data view stacks on mobile. Geist and Geist Mono are served locally. [Design system](docs/design/design-system.md)

The web app owns routing and the registry. The tool owns UI and worker orchestration. Separate workspace packages handle normalization, payload decoding, and export redaction. The continuity audit preserves all three accepted ADRs.

## Current work and blockers

Release work remains open for input admission, production validation across the OS matrix, and release-host privacy verification. The original wording about timeline filters needs a product decision. No other tool is in implementation.

## Latest validation

2026-11-24 · macOS 26.6.2 arm64, Node.js 24.21.0, pnpm 12.23.0, and Chromium 159.0.8154.6 (Playwright 1.65.1).

| Check                           | Result                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, lint, and type checking | Passed.                                                                                                                                                                                                                                                                                                                                         |
| Unit tests                      | 20 passed in 4 files.                                                                                                                                                                                                                                                                                                                           |
| Production build                | Passed with Turbopack, including the Log Inspector route.                                                                                                                                                                                                                                                                                       |
| Production browser tests        | 9 passed. Covered discovery, directory search, mobile use, keyboard parsing and inspector focus, sidebar and theme preferences, paging, file and paste input, cancellation, payloads, errors, and redacted downloads. The synthetic privacy flow checked same-origin requests, no log marker in captured traffic, and no stored workspace data. |
| Visual and contrast review      | Captured before views and reviewed the redesigned homepage, directory, empty workspace, and parsed workspace at 1440, 1280, 1024, and 390 px in both themes. No page-level horizontal overflow. The 14 checked semantic token pairs met the applicable AA contrast thresholds in both themes.                                                   |

Loopback access required an approved local retry for the build and browser checks. The production browser tests ran on macOS. The Linux and Windows CI jobs, Safari and Firefox, assistive technology, and release-host verification remain open. The pinned dependencies and lockfile are unchanged.

## Next task

Harden editor input admission with synthetic regression coverage. Review keyboard behavior in Safari and Firefox, verify the full OS matrix, resolve the timeline requirement, and validate privacy on the chosen release host once authorized.

[Workflow](docs/development/workflow.md) · [Backlog](docs/development/backlog.md) · [Known issues](docs/development/known-issues.md) · [Changelog](CHANGELOG.md) · [Log Inspector spec](docs/products/log-inspector.md) · [Architecture](docs/architecture/overview.md) · [ADRs](docs/decisions)
