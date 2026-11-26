# Development backlog

See [project status](../../PROJECT_STATUS.md) for the latest verification and [known issues](known-issues.md) for supporting evidence.

## P0 · Critical and release-blocking

- **Verify the release candidate.** A frozen install and the full format, lint, type, unit, build, and production Chromium suite pass on Linux, macOS, and Windows. Record results and the browser support scope in project status.
- **Enforce the input limit at entry.** Reject oversized paste and editor edits before they can grow the Monaco model beyond the documented UTF-8 limit. Cover multibyte input, multiple selections, and repeated edits, preserving the previous valid workspace on rejection.
- **Verify the chosen release host when authorized.** Confirm HTTPS, effective security headers, same-origin assets and workers, and hosting logging and retention. Rerun the synthetic privacy flow on the release candidate and record the results before making it public.

## P1 · Important near-term improvements

- **Design verified subscription access.** Define the account and billing integration with the existing server entitlement source before offering Pro subscriptions. [Product checkpoint](../products/integration-compare.md)
- **Resolve the timeline requirement.** Confirm whether the intended MVP needs time-window filtering in addition to sorting. If approved, cover start and end boundaries, missing timestamps, and combined severity and identifier filters. If sorting is sufficient, record the agreed scope.
- **Fill browser verification gaps.** Exercise file and paste input, keyboard navigation, worker startup, and downloads in any additional browsers the product intends to support. Record explicit support limits and reproduce any browser-specific issues with synthetic inputs.
- **Measure interaction at the input cap.** Run the existing synthetic benchmark on representative hosts and measure explorer search, sorting, and export separately. Record the test setup and numbers, then prioritize changes against observed delays.

## P2 · Future enhancements

- **Evaluate adjustable inspector widths.** Use feedback from real log exploration sessions to determine whether the fixed desktop split needs an accessible resizable divider.

- **Evaluate broader log layout support.** Gather representative synthetic examples and agree on a bounded set of aliases or formats before implementation. Each accepted format needs a fixture and recovery tests for malformed records.

## P3 · Exploratory ideas

The [product roadmap](../../ROADMAP.md) lists candidate tools. Customer evidence and a scoped product spec are prerequisites for promoting an idea into implementation work.
