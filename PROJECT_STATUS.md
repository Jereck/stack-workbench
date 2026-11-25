# Project status

**Current phase** · Integration Compare Phase 3A engine and browser worker checkpoint. Phase 3B workspace is next. Log Inspector remains the available tool, with public release hardening pending.

**Redesign baseline** · Clean `feature/design-system` at `5988436` on 2026-11-24. The checked-in Log Inspector spec, architecture docs, and accepted ADRs define the scope.

## Implemented and partial work

| Area                        | Status                                                                                                                                                                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 platform foundation | Implemented site shell, homepage, tool directory, route metadata, planned-tool pages, 404, About and Privacy pages, theme preference, CI and workspace tests. Feedback is informational and accepts no submissions.                                                                                |
| Phase 1 input and parsing   | Implemented Monaco paste/edit, single local file and drop, examples, cancellation, detection and override, and malformed record recovery. Supports text/mixed, JSON/NDJSON, Serilog, and CloudWatch within the documented formats. File and parser limits exist. Editor admission remains partial. |
| Phase 1 exploration         | Implemented summary, warnings, severity and text search, ID filtering and correlation groups, timestamp sorting, pagination, raw and normalized details, exceptions, and embedded JSON/XML/SOAP inspection. A time-window filter is absent.                                                        |
| Phase 1 export and privacy  | Implemented selected and filtered JSON/text downloads with default configurable masking, raw copy, same-origin workers, and Clear with undo reset. Masking is best effort. Release hosting has yet to be verified.                                                                                 |

The homepage uses a preview derived from the bundled synthetic sample. The directory searches the registry and lists available tools by category. At `/tools/log-inspector`, the app shell groups tools in a collapsible sidebar, and the tool keeps event details in an adjacent inspector on desktop. The current data view stacks on mobile. Geist and Geist Mono are served locally. [Design system](docs/design/design-system.md)

The web app owns routing and the registry. Tool packages own UI and worker orchestration. Separate workspace packages handle normalization, payload decoding, comparison, and export redaction.

## Integration Compare checkpoint

| Phase                    | Status                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3A · Engine              | Implemented and tested. Framework-independent comparison of JSON, XML and SOAP, text, HTTP, and supported normalized logs. Includes typed rules, array matching, observed-structure mode, bounded results and actionable errors, and a cancellable browser worker. |
| 3B · Workspace           | Pending. Add the dedicated route, registration and navigation, two editable inputs, comparison views, rule editor, and responsive browser and privacy validation.                                                                                                  |
| 3C · Advanced workflows  | Pending. Add log-session and transaction matching, regression observations, batch comparison, local profiles, and reports.                                                                                                                                         |
| 3D · Product integration | Pending. Add local Log Inspector transfers, central typed entitlements, development simulation, and accurate upgrade entry points.                                                                                                                                 |

The new engine is in `packages/comparison-engine`. `tools/integration-compare` exports the worker adapter. Both reuse existing parser packages. ADR 0004 records the comparison boundary. [Product scope and benchmarks](docs/products/integration-compare.md) · [ADR 0004](docs/decisions/0004-integration-comparison-engine.md)

## Current work and blockers

Log Inspector release work remains open for input admission, production validation across the OS matrix, and release-host privacy verification. The timeline filter needs a product decision. Integration Compare becomes discoverable when the Phase 3B route and workspace pass browser validation.

## Latest validation

2026-11-25 · Windows 11 build 26200, Node.js 24.21.0, pnpm 12.23.0, and Playwright Chromium 159.0.8154.6.

| Check                                           | Result                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install, format, lint, and type checking | Passed. The lockfile adds two workspace importers.                                                                                                                                       |
| Unit tests                                      | 45 passed in six files.                                                                                                                                                                  |
| Production build                                | Passed with Turbopack.                                                                                                                                                                   |
| Chromium browser tests                          | 11 passed. Nine cover the production site and Log Inspector. Two exercise the bundled worker fixture, including termination and restart, DTD rejection, and network and storage privacy. |
| Performance                                     | Six synthetic workloads measured worker processing and browser round-trip time. [Benchmark and limits](docs/products/integration-compare.md)                                             |

Integration Compare theme, responsive layout, keyboard, and Next.js route checks belong to Phase 3B. Release-host and additional OS and browser checks are tracked in the backlog.

### Previous Log Inspector redesign validation

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

Build the Phase 3B Integration Compare workspace in the existing shell. Wire its worker adapter, add the explorer and alternate views, and validate input retention, privacy, cancellation, accessibility, and both themes on the real route. Log Inspector release hardening stays in the development backlog.

[Workflow](docs/development/workflow.md) · [Backlog](docs/development/backlog.md) · [Known issues](docs/development/known-issues.md) · [Changelog](CHANGELOG.md) · [Log Inspector spec](docs/products/log-inspector.md) · [Architecture](docs/architecture/overview.md) · [ADRs](docs/decisions)
