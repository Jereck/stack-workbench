# Integration Compare

**Status** · The Free workspace is available at [`/tools/integration-compare`](../../apps/web/src/app/tools/integration-compare/page.tsx). Pro workflows can be exercised using the development simulator. Subscriptions aren’t available yet.

Integration Compare helps backend, enterprise integration, support, QA, DevOps, and data integration engineers find what changed between an expected result and an observed result. Typical comparisons include successful and failing API responses, payloads from two environments, and behavior before and after a deployment.

## Workspace

1. Paste, open, or drop one UTF-8 file into each side. Load a sample in either editor or load a sample pair. Use the optional labels for contexts such as DEV and QA. The editors resize independently, and the toolbar expands both together.
2. Select **Compare** or press **Ctrl/Command + Enter** to run the comparison. Review the detected formats or select a format manually. Selecting **Application logs** also enables a log-format override. **Cancel** stops the worker or in-progress file reads.
3. Use **Differences** to search field paths and value previews, filter by type, expand grouped paths, and inspect or copy individual values. The previous and next controls follow visible changes. Turn on **Show ignored** to review excluded evidence and its rule.
4. Use **Side by side** to inspect aligned values or text lines with nearby context. Plain-text comparisons can copy a unified diff. Use **Structure** to open JSON and XML branches and jump from marked nodes into the explorer.
5. Open **Rules** to add, edit, toggle, or remove rules, apply a preset, or change comparison settings. **Ignore this path** adds a rule from the active difference. Committing a rule or setting reruns the current comparison when inputs have already been compared. Editing or swapping the inputs requires selecting **Compare** again.

**Clear workspace** resets the editors, undo history, labels, rules, and in-memory results across workflows. Batch and Session also provide individual clear actions. The selected result view is stored as a browser preference.

## Recorded sessions and transactions

1. Open **Log sessions**. Paste or open logs on each side and choose **Compare sessions**. Use the format override for a known Log Inspector format.
2. Review severity, event counts, exceptions, payloads, correlation groups, and service participation. Open **HTTP transactions** or **Events** to inspect matches and unresolved groups.
3. Open **Match correlation groups** to select one independently recorded group on each side. Search by group ID when the list is long. **Compare full sessions** restores the full input scope.
4. Open **Manual transaction matching** and enter transaction numbers from the HTTP table. A manual match reserves both records before automatic matching. Remove the override to recalculate automatic matches.
5. Open a regression observation’s evidence number to see its difference and source log records.

The engine reuses normalized Log Inspector records. It joins an observed request and response within a session when an explicit request or transaction ID identifies one compatible pair. Across sessions it matches method and path after removing the origin, query, fragment, and trailing slashes. Recorded operation and configured exact JSON payload identifiers can also inform matching. Events use configured property identifiers, HTTP metadata and direction, recorded operation, message template, or exact message, in that order. Service names participate by default. Correlation IDs can differ across sessions. Timestamps establish no matches. Ambiguous keys retain their candidates.

Findings show severity, service participation, recorded ordering, exceptions, HTTP status, explicit numeric millisecond durations, and semantic changes in captured request and response bodies. Competing payload captures produce a warning. The first 50 observations link to retained evidence. Each run retains up to 8,000 findings and displays an omission count. A missing record leaves execution outcomes unknown.

## Batch and saved profiles

In **Batch**, add and label pairs, paste inputs, and select a shared profile if desired. Each pair can override its format. **Run all pairs** queues sequential workers. The table marks equivalent, changed, and failed pairs. **Inspect** opens full evidence and report controls for a pair. Cancel stops the active worker and keeps completed summaries.

Batch holds up to 128 pairs and 32 MiB of aggregate UTF-8 input, with the 4 MiB per-input limit. The queue runs one worker at a time and retains summaries. Inspecting a pair reruns it with its batch settings. These bounds cap workspace memory independently of generated evidence.

In **Profiles**, create a profile from current settings or import a version 1 JSON file. Edit its name, description and formats, or replace its rules and session settings with the current workspace settings. You can duplicate, export, delete, or clear profiles. Apply a profile to the payload workspace here, or select it separately from the Log sessions or Batch toolbar.

Profiles store settings only, under `stack-workbench-compare-profiles-v1`. Raw inputs, comparison labels, group IDs, manual matches, and results stay in memory. Review manually entered profile names, descriptions, identifiers, and paths for secrets before saving or exporting. Imports accept up to 64 KiB. Local storage supports up to 50 profiles within a combined 512 Ki UTF-16 code-unit budget.

## Regression reports

Open **Regression report** in a payload, session, or inspected batch-pair result. Choose Markdown, JSON, CSV, or printable HTML. Reports include labels, date, settings and rules, summary and evidence, warnings, and limitations. Captured values are omitted by default and redaction is enabled. Review exports before sharing. Open the downloaded HTML in a browser to print it. CSV guards against spreadsheet formula prefixes. Printable HTML escapes user data and blocks remote resources.

## Engine behavior

| Input            | Comparison                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON             | Object key order is immaterial. Scalars retain their types. Missing fields differ from null, empty values, zero, and false. Arrays compare by position, as a multiset, or by one or more exact scalar identifier fields.                                                                                                                                                                                |
| XML              | Expanded element and attribute names use namespace URI and local name. Sibling occurrences pair by name and occurrence, with optional identifier attributes for sibling names that use those attributes. The engine tracks the relative order of matched children. It removes element-only formatting whitespace and preserves mixed content and inherited `xml:space="preserve"`.                      |
| SOAP 1.1 and 1.2 | Compare the envelope or the single SOAP Body. Header and Fault fields use their structural paths. Fault codes with resolved QName prefixes compare by expanded value.                                                                                                                                                                                                                                   |
| Plain text       | Aligns lines by common prefix, suffix, and a bounded longest-common-subsequence calculation. The engine returns paired rows and offers unified diff serialization. Default line-ending normalization preserves the distinction between a final newline and an unterminated last line. Whitespace normalization is optional.                                                                             |
| Raw HTTP         | Reads recorded request or response lines, method, address and path, status, repeated headers and query parameters, and one captured body. Header names are case-insensitive. Repeated header and query values retain occurrence order. JSON and XML media types select semantic body parsing, and absent content type allows detection. Duration compares only when explicitly recorded on both inputs. |
| Application logs | Reuses the Log Inspector formats and normalized event model for ordered record comparison and warnings. Explicit log format selection supports mixed text and structured logs. Session and transaction matching are Phase 3C.                                                                                                                                                                           |

Automatic detection prioritizes recognizable structured formats, HTTP start lines, and supported log signatures. Choose a format explicitly when several interpretations are possible. For example, select JSON for an ordinary payload shaped like compact Serilog. A failed parse returns actionable feedback and the original input. Malformed log rows remain available with parser warnings.

Unordered arrays preserve duplicate counts. Ordinary unordered matching groups structural signatures. If applicable rules alter equality, a bounded matching algorithm seeks the maximum number of compatible pairs. Keyed matching only pairs unique identifiers. Missing or ambiguous records are reported individually with matching warnings. Rules use the baseline path for matched records. The explorer and structure view show the actual target path when a record moved. Unpaired target records use the target path.

Observed structure mode compares object nesting and field types. JSON arrays compare their distinct observed element shapes. Changes in scalar values and the count of repeated shapes have no bearing on that mode. The result describes the inputs' observed structure. Formal JSON Schema and XSD validation are outside this phase.

## Rules

Rules have stable IDs, an enabled flag, and a path or exact field-name selector. Paths use JSON Pointer syntax with `*` for one segment, `**` for zero or more segments, and `~2` for a literal asterisk. An empty path selects the root. XML paths use expanded element names and sibling occurrence indices, with `@attributes`, `#text`, and `#order` for the respective values. HTTP paths include `/headers`, `/query`, and `/body`.

Exclude a specific timestamp, correlation ID, request ID, or GUID by selecting its path. Use field-name rules for selected JSON properties, XML elements or attributes, HTTP headers, and query parameters. XML name rules accept expanded names or a local name across namespaces. Rule presets cover selected HTTP tracing headers and common root request and correlation ID paths. Optional path rules adjust array matching, absolute numeric tolerance, case, and whitespace. Escaped JSON decoding is an explicit setting. Ignored changes retain their contributing rule and explanation.

## Product access

| Capability                                                         | Free     | Pro      | Delivery                                                                             |
| ------------------------------------------------------------------ | -------- | -------- | ------------------------------------------------------------------------------------ |
| Log Inspector                                                      | Included | Included | All inspection, payload and export controls                                          |
| JSON, XML and SOAP, and plain text                                 | Included | Included | Differences, side-by-side and structure views, basic filters, and exact-path ignores |
| Advanced rules, arrays, HTTP, and observed-structure analysis      |          | Included | Wildcards, normalization, identifier matching, and schema differences                |
| Log sessions, transaction matching, batches, profiles, and reports |          | Included | Recorded exchanges, manual matches, saved settings, and evidence exports             |

Production resolves entitlements in the web app and currently grants Free. To exercise Pro locally, run `pnpm dev` and select **Pro** under **Development tier**. The simulation stays in the same browser tab during client navigation. Refresh returns to Free, and changing tiers resets the open comparison workspace. Production builds omit the simulator. Client URL parameters, cookies, and browser preferences supply no entitlements.

Treat these browser-side checks as a commercial UX boundary and assume users can modify browser execution. Future authentication and billing can supply a verified entitlement snapshot from the server boundary. [Entitlement decision](../decisions/0006-tool-handoff-and-entitlements.md) · [Pricing hypotheses](../business/monetization.md)

## Start in Log Inspector

Open an extracted JSON, XML, or SOAP payload in Log Inspector and choose **Send as baseline** or **Send as target**. You can stage both sides before selecting **Open Integration Compare**. Staging another input into the same slot replaces the staged copy. The source log and extracted payload stay available in the inspector while you stage.

Pro users can also stage the original logs from a current successful parse, along with the detected or selected log format. Parse again after editing before staging a session. **Clear staged inputs** or **Clear workspace** discards the pending handoff. Both tools keep the data in the current browser document. Opening Integration Compare consumes the staged inputs once, and a refresh clears staged and received inputs.

## Privacy and processing limits

The worker accepts input and configuration through structured browser messages. Inputs, labels, active rules, and results stay in memory. Explicit profile saves persist validated settings. Cancellation terminates the active worker. XML rejects DTDs and external entity declarations. The workspace renders HTTP addresses and markup as text. Production-route browser tests verify same-origin requests and exclude synthetic input from network traffic and storage. Clipboard and download actions create copies the user controls.

| Limit                                                                                                     | Behavior                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 MiB UTF-8 per input                                                                                     | Oversized input fails with the original retained.                                                                                              |
| 48 JSON or XML nesting levels                                                                             | Deeper parsed documents fail. JSON also shares the existing structural-marker bound. Log event projection has up to four extra wrapper levels. |
| 150,000 normalized JSON or log comparison values and 100,000 XML nodes or attributes per input            | Higher structural density fails with an excerpt suggestion.                                                                                    |
| Four escaped JSON decoding steps along a path and 4 Mi UTF-16 candidate code units                        | Nested decoding stops at the step limit. Going over the cumulative budget fails.                                                               |
| 60,000 text lines per side and 1,000,000 changed-region alignment cells                                   | More lines fail. If precise alignment exceeds the cell budget, the result warns that it paired the changed region by position.                 |
| 8,000 headers and 8,000 query fields                                                                      | Oversized HTTP sections fail.                                                                                                                  |
| 64 rules, 160 path segments, 2,048 characters per path, and eight identifier fields per matching strategy | Invalid active rules fail with guidance. Rule matching has a four-million-token work limit.                                                    |
| 128 items per side and 4,096 candidate pairs for flexible unordered matching                              | Larger ambiguous searches fail with a strategy or excerpt suggestion. Exact unordered comparisons use indexed groups instead.                  |
| 600,000 comparison visits, 8,000 retained difference rows, and 8,000 retained matching warnings           | The work limit fails explicitly. Retention limits preserve full counts and surface a notice.                                                   |

Numeric comparisons use finite JavaScript numbers and reject unsafe integers. Duplicate JSON object names follow the platform parser's last-value behavior. XML compares elements, attributes, and text content. Same-name siblings without identifiers pair by occurrence. Raw HTTP requires a readable capture of one request or response with any body already decoded.

## Phase 3A benchmark

Run `node tests/bench/integration-compare.mjs` from the repository root with pinned dependencies and Playwright Chromium installed. The script bundles the real worker and serves the test fixture over loopback. Each time is the median of five runs after one warm-up, with the range in parentheses. Host was Windows 11 build 26200, AMD Ryzen 7 5800X, Node.js 24.21.0, pnpm 12.23.0, and headless Chromium 159.0.8154.6.

| Synthetic workload            | Baseline and target bytes |     Worker time, ms | Browser elapsed, ms |
| ----------------------------- | ------------------------: | ------------------: | ------------------: |
| Small JSON                    |                   35 / 34 |       0.7 (0.7–0.8) |       5.7 (5.3–6.3) |
| Nested JSON, 6,000 items      |         490,968 / 490,968 |    27.5 (27.1–27.7) |    45.7 (44.9–46.7) |
| Keyed JSON, 15,000 records    |     1,203,831 / 1,203,831 |    49.0 (48.3–56.2) |    69.7 (69.1–78.8) |
| SOAP, 4,500 items             |         278,068 / 278,068 |    50.2 (49.4–51.0) |    82.0 (80.2–96.1) |
| Normalized logs, 4,000 events |         530,889 / 530,889 | 115.5 (114.0–118.9) | 157.5 (152.4–162.9) |
| 24 independent HTTP pairs     |       2,222 / 2,174 total |    25.1 (24.6–25.3) | 126.3 (125.4–129.6) |

Worker time includes parsing and comparison. Browser elapsed includes worker startup, structured cloning, and replacement workers for the sequential HTTP run. Cancellation of the large keyed comparison settled within the browser timer's 0.1 ms resolution after the cancel call. Workspace rendering and batch processing are outside these measurements.

## Phase 3B workspace measurement

On the same host, the production Next.js route compared two 148,891-byte JSON arrays of 6,000 synthetic records with the same numeric IDs and different quantities. Chromium recorded a median of 67.2 ms from **Compare** to the summary and first 24 difference rows in the DOM. Five runs after one warm-up ranged from 52.3 to 76.3 ms. The timing includes worker startup, parsing, comparison, result transfer, and the initial explorer render.

## Phase 3C workflow measurements

Measured on the same Windows host using the production Next.js route and headless Chromium. These are medians of five runs after one warm-up. Elapsed time includes worker startup, processing, and initial result rendering.

| Synthetic workload                                                       |                  Input size | Browser elapsed, ms |
| ------------------------------------------------------------------------ | --------------------------: | ------------------: |
| Two sessions with 4,000 records and 2,000 matched HTTP transactions each | 1,098,249 / 1,086,329 bytes | 255.9 (248.3–298.7) |
| Batch of 24 small HTTP response pairs                                    |           3,072 bytes total | 319.7 (312.8–347.6) |

The session run used one captured request and response per transaction. The batch completed one worker at a time and retained 24 summaries. These measurements describe the tested workloads on one host.

## Phase 3D worker recheck

Reran the Phase 3A worker fixture on the same Windows host after adding capability checks. The fixture used simulated Pro to exercise all formats. Timings are medians over five runs after a warm-up. Input sizes match the Phase 3A table. Reported elapsed time includes worker startup and result transfer. It measures the worker fixture independently of routing and workspace rendering.

| Synthetic workload            | Worker time, ms | Browser elapsed, ms |
| ----------------------------- | --------------: | ------------------: |
| Small JSON                    |             0.8 |                 6.4 |
| Nested JSON, 6,000 items      |            28.0 |                47.4 |
| Keyed JSON, 15,000 records    |            54.2 |                76.0 |
| SOAP, 4,500 items             |            53.8 |                87.7 |
| Normalized logs, 4,000 events |           120.4 |               167.2 |
| 24 independent HTTP pairs     |            32.7 |               185.2 |

The large keyed run settled within the timer's 0.1 ms resolution after cancellation. Remote endpoint execution and larger inputs remain outside the documented scope.

## Next phase

The next release work is to verify hosting and browser support. Account-backed entitlement verification and subscription billing are separate product work.
