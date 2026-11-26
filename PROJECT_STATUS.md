# Project status

**Current phase** · Release hardening for Log Inspector and Integration Compare after the Phase 3D integration checkpoint.

**Redesign baseline** · Clean `feature/design-system` at `5988436` on 2026-11-24. The checked-in Log Inspector spec, architecture docs, and accepted ADRs define the scope.

## Implemented and partial work

| Area                        | Status                                                                                                                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 platform foundation | Implemented site shell, homepage, tool directory, route metadata, planned-tool pages, 404, About and Privacy pages, theme preference, CI and workspace tests. Feedback is informational and accepts no submissions.                                                                            |
| Phase 1 input and parsing   | Implemented Monaco paste/edit, single local file and drop, examples, cancellation, detection and override, and malformed record recovery. Supports text/mixed, JSON/NDJSON, Serilog, and CloudWatch. The 4 MiB UTF-8 limit is enforced at file admission, before editor edits, and at parsing. |
| Phase 1 exploration         | Implemented summary, warnings, severity and text search, ID filtering and correlation groups, timestamp sorting, pagination, raw and normalized details, exceptions, and embedded JSON/XML/SOAP inspection. A time-window filter is absent.                                                    |
| Phase 1 export and privacy  | Implemented selected and filtered JSON/text downloads with default configurable masking, raw copy, same-origin workers, and Clear with undo reset. Masking is best effort. Release hosting has yet to be verified.                                                                             |

The homepage uses a preview derived from the bundled synthetic sample. The directory searches the registry and lists available tools by category. At `/tools/log-inspector`, the app shell groups tools in a collapsible sidebar, and the tool keeps event details in an adjacent inspector on desktop. The current data view stacks on mobile. Geist and Geist Mono are served locally. [Design system](docs/design/design-system.md)

The web app owns routing and the registry. Tool packages own UI and worker orchestration. Separate workspace packages handle normalization, payload decoding, comparison, and export redaction.

## Integration Compare checkpoint

| Phase                    | Status                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3A · Engine              | Implemented and tested. Framework-independent comparison of JSON, XML and SOAP, text, HTTP, and supported normalized logs. Includes typed rules, array matching, observed-structure mode, bounded results and actionable errors, and a cancellable browser worker. |
| 3B · Workspace           | Implemented at `/tools/integration-compare`. Two editable inputs, discovery and navigation, searchable difference explorer, aligned and structural views, and editable rules.                                                                                      |
| 3C · Advanced workflows  | Implemented. Recorded session and transaction matching, correlation group selection, manual matches, evidence-linked regression summaries, batch runs, settings-only local profiles, and reports.                                                                  |
| 3D · Product integration | Implemented. Log Inspector stages payloads and parsed sessions for either side in the current tab. Typed capabilities govern comparison controls and worker operations. Production grants Free and development can simulate Pro.                                   |

The engine is in `packages/comparison-engine`. `tools/integration-compare` owns the workspace, worker, batch queue, profile storage, and report downloads. The tool uses the existing log, payload, and redaction packages. The shared package defines capabilities and tool handoff commands. The web app owns the entitlement source, simulator, and in-memory handoff. [Product scope and benchmarks](docs/products/integration-compare.md) · [ADR 0004](docs/decisions/0004-integration-comparison-engine.md) · [ADR 0005](docs/decisions/0005-comparison-advanced-workflows.md) · [ADR 0006](docs/decisions/0006-tool-handoff-and-entitlements.md)

## Current work and blockers

Log Inspector rejects edits over the byte cap before they modify the input. Native Safari and screen-reader verification remain open. The repository has no configured release URL for checking deployed headers, TLS, logging and retention. The timeline filter decision remains in the backlog. Production grants Free, and verified account entitlements and subscription billing are tracked separately.

## Latest validation

2026-11-26 · Release hardening on Windows 11 build 26200 with Node.js 24.21.0, pnpm 12.23.0, and Playwright 1.65.1.

| Check                                                             | Result                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install, format, lint, type checking, and production build | Passed. No dependency or lockfile changes.                                                                                                                                                                                                               |
| Unit tests                                                        | 63 passed in nine files.                                                                                                                                                                                                                                 |
| Browser tests                                                     | 25 production Chromium and 11 development Chromium tests passed. Three smoke cases also passed in Firefox 159.0 and WebKit 27.2.                                                                                                                         |
| Ubuntu 24.04.1 under WSL2                                         | Frozen install, format, lint, types, build, 63 unit tests, and all 36 Chromium browser tests passed in an isolated checkout. Chromium used local copies of the required runtime libraries.                                                               |
| Keyboard, accessibility, and layout                               | Verified editor Tab exit, shortcuts, event-detail focus and return, and the limit status as a polite live region in Chromium. Reviewed the limit notice with existing results at 1280 and 390 px in both themes, with no page-level horizontal overflow. |
| Privacy and headers                                               | Both production routes returned the checked security headers on loopback. The release smoke workflow loaded only same-origin resources and kept its synthetic marker out of requests and storage. The deployed host requires separate verification.      |

### Previous Phase 3D validation

2026-11-25 · Phase 3D on Windows 11 build 26200, Node.js 24.21.0, pnpm 12.23.0, and Playwright Chromium 159.0.8154.6.

| Check                                           | Result                                                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install, format, lint, and type checking | Passed. The lockfile changes link existing workspace packages.                                                                                                                                                                     |
| Unit tests                                      | 63 passed in nine files. Capability and handoff tests exercise format and settings gates, one-shot transfer, slot replacement, and UTF-8 limits.                                                                                   |
| Production build                                | Passed. Both tool routes are prerendered, and the production browser bundle omits the simulator controls.                                                                                                                          |
| Chromium browser tests                          | 33 passed across the production and development servers. The suite covers ignored client entitlement claims, Free comparisons, JSON and XML transfer, same-tab navigation, transfer privacy, and Pro session comparison and reset. |
| Visual and responsive review                    | Checked the handoff actions and Free locked workflow in light and dark at 1440, 1280, and 390 px. The exercised layouts had no page-level horizontal overflow.                                                                     |
| Performance                                     | Reran all six synthetic worker workloads. Median browser elapsed times were 6.4 to 185.2 ms. [Workloads, timings, and limits](docs/products/integration-compare.md#phase-3d-worker-recheck)                                        |

### Previous Phase 3C validation

2026-11-25 · Phase 3C on Windows 11 build 26200, Node.js 24.21.0, pnpm 12.23.0, and Playwright Chromium 159.0.8154.6.

| Check                                           | Result                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install, format, lint, and type checking | Passed. The lockfile adds a link to the existing redaction package.                                                                                                                                                  |
| Unit tests                                      | 58 passed in eight files. New coverage includes session matches and missing responses, profile validation, report evidence, redaction, and CSV and HTML escaping.                                                    |
| Production build                                | Passed. Turbopack prerendered the Integration Compare route.                                                                                                                                                         |
| Chromium browser tests                          | 28 passed, including six advanced-workflow cases for evidence drilldown, cross-session correlation groups, manual transaction pairing, batch profiles and cancellation, profile persistence, and redacted downloads. |
| Visual and responsive review                    | Reviewed log sessions, batch, and profiles at 1440, 1280, and 390 px in light and dark themes. The exercised layouts had no page-level horizontal overflow.                                                          |
| Performance                                     | Two 4,000-event sessions matched 2,000 HTTP transactions in a median 255.9 ms. A 24-pair HTTP batch completed in a median 319.7 ms. [Measurement details](docs/products/integration-compare.md)                      |

### Previous Phase 3B validation

2026-11-25 · Phase 3B on Windows 11 build 26200, Node.js 24.21.0, pnpm 12.23.0, and Playwright Chromium 159.0.8154.6.

| Check                                           | Result                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install, format, lint, and type checking | Passed.                                                                                                                                                                                                                                         |
| Unit tests                                      | 45 passed in six files, including relocated JSON and XML paths.                                                                                                                                                                                 |
| Production build                                | Passed. Turbopack prerendered `/tools/integration-compare`.                                                                                                                                                                                     |
| Chromium browser tests                          | 22 passed, including 11 on the Integration Compare route. Covered discovery, clipboard and keyboard use, files and drop, rules, aligned and structural results, cancellation, oversized input, clear and undo, and network and storage privacy. |
| Visual and responsive review                    | Reviewed 1440 and 1280 px in both themes, 1024 px in light, and 390 px in dark. Automated checks exercised 390 px in both themes. No page-level horizontal overflow. The tested editor and primary-action text pairs met AA contrast.           |
| Workspace performance                           | A production Chromium comparison of 6,000 changed records rendered the first 24 rows in a median 67.2 ms from Compare. [Benchmark details](docs/products/integration-compare.md)                                                                |

Additional OS, browser, assistive-technology, and release-host checks are tracked in the backlog.

### Previous Phase 3A validation

2026-11-25 · Windows 11 build 26200, Node.js 24.21.0, pnpm 12.23.0, and Playwright Chromium 159.0.8154.6.

| Check                                           | Result                                                                                                                                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install, format, lint, and type checking | Passed. The lockfile adds two workspace importers.                                                                                                                                       |
| Unit tests                                      | 45 passed in six files.                                                                                                                                                                  |
| Production build                                | Passed with Turbopack.                                                                                                                                                                   |
| Chromium browser tests                          | 11 passed. Nine cover the production site and Log Inspector. Two exercise the bundled worker fixture, including termination and restart, DTD rejection, and network and storage privacy. |
| Performance                                     | Six synthetic workloads measured worker processing and browser round-trip time. [Benchmark and limits](docs/products/integration-compare.md)                                             |

### Previous Log Inspector redesign validation

2026-11-24 · macOS 26.6.2 arm64, Node.js 24.21.0, pnpm 12.23.0, and Chromium 159.0.8154.6 (Playwright 1.65.1).

| Check                           | Result                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format, lint, and type checking | Passed.                                                                                                                                                                                                                                                                                                                                         |
| Unit tests                      | 20 passed in 4 files.                                                                                                                                                                                                                                                                                                                           |
| Production build                | Passed with Turbopack, including the Log Inspector route.                                                                                                                                                                                                                                                                                       |
| Production browser tests        | 9 passed. Covered discovery, directory search, mobile use, keyboard parsing and inspector focus, sidebar and theme preferences, paging, file and paste input, cancellation, payloads, errors, and redacted downloads. The synthetic privacy flow checked same-origin requests, no log marker in captured traffic, and no stored workspace data. |
| Visual and contrast review      | Captured before views and reviewed the redesigned homepage, directory, empty workspace, and parsed workspace at 1440, 1280, 1024, and 390 px in both themes. No page-level horizontal overflow. The 14 checked semantic token pairs met the applicable AA contrast thresholds in both themes.                                                   |

Loopback access required an approved local retry for the build and browser checks. The production browser tests ran on macOS. The Linux and Windows CI jobs, Safari and Firefox, assistive technology, and release-host verification were still open at this checkpoint. The pinned dependencies and lockfile were unchanged.

## Next task

Finish release sign-off in native Safari and with a screen reader. When a release host is available, verify its TLS, effective security headers, logs and retention, and rerun the synthetic privacy workflow against it. Plan verified account entitlements and billing as a separate implementation.

[Workflow](docs/development/workflow.md) · [Backlog](docs/development/backlog.md) · [Known issues](docs/development/known-issues.md) · [Changelog](CHANGELOG.md) · [Log Inspector spec](docs/products/log-inspector.md) · [Architecture](docs/architecture/overview.md) · [ADRs](docs/decisions)
