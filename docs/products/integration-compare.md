# Integration Compare

**Status** · Phase 3A comparison engine and cancellable browser worker validated. The public workspace and registry entry are Phase 3B.

Integration Compare helps backend, enterprise integration, support, QA, DevOps, and data integration engineers find what changed between an expected result and an observed result. Typical comparisons include successful and failing API responses, payloads from two environments, and behavior before and after a deployment.

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

Unordered arrays preserve duplicate counts. Ordinary unordered matching groups structural signatures. If applicable rules alter equality, a bounded matching algorithm seeks the maximum number of compatible pairs. Keyed matching only pairs unique identifiers. Missing or ambiguous records are reported individually with matching warnings. Paired records use the baseline index for their paths. Unpaired target records use the target index.

Observed structure mode compares object nesting and field types. JSON arrays compare their distinct observed element shapes. Changes in scalar values and the count of repeated shapes have no bearing on that mode. The result describes the inputs' observed structure. Formal JSON Schema and XSD validation are outside this phase.

## Rules

Rules have stable IDs, an enabled flag, and a path or exact field-name selector. Paths use JSON Pointer syntax with `*` for one segment, `**` for zero or more segments, and `~2` for a literal asterisk. An empty path selects the root. XML paths use expanded element names and sibling occurrence indices, with `@attributes`, `#text`, and `#order` for the respective values. HTTP paths include `/headers`, `/query`, and `/body`.

Exclude a specific timestamp, correlation ID, request ID, or GUID by selecting its path. Use field-name rules for selected JSON properties, XML elements or attributes, HTTP headers, and query parameters. XML name rules accept expanded names or a local name across namespaces. Rule presets cover selected HTTP tracing headers and common root request and correlation ID paths. Optional path rules adjust array matching, absolute numeric tolerance, case, and whitespace. Escaped JSON decoding is an explicit setting. Ignored changes retain their contributing rule and explanation.

## Planned product access

| Capability                                                                           | Free     | Pro      | Delivery                                                         |
| ------------------------------------------------------------------------------------ | -------- | -------- | ---------------------------------------------------------------- |
| Log Inspector                                                                        | Included | Included | Available at `/tools/log-inspector`                              |
| Basic JSON, XML, and text comparison, side-by-side results, and basic filtering      | Included | Included | Comparison core in 3A. Workspace and filters in 3B.              |
| Advanced rules and arrays, raw HTTP, and observed-structure analysis                 |          | Included | Comparison core in 3A. Controls in 3B. Capabilities gated in 3D. |
| Session and transaction matching, batch runs, saved profiles, and regression reports |          | Included | Workflows in 3C. Capabilities gated in 3D.                       |

Phase 3D will add the typed entitlement interface, development-only Free and Pro simulation, and a Free production default. Browser gating will control the commercial user experience. Future authentication and billing will provide verified entitlements through that interface. [Pricing hypotheses](../business/monetization.md)

## Privacy and processing limits

The worker accepts input and configuration through structured browser messages. Engine and worker code process contents in memory and make no network or storage calls. Cancellation terminates the active worker and settles the job immediately. XML rejects DTDs and external entity declarations. HTTP parsing treats addresses as text. Parse errors use fixed messages and safe locations. The browser fixture verified same-origin assets, no synthetic input in request URLs, headers or bodies, and empty local, session, and IndexedDB storage.

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

## Next phases

Phase 3B mounts the engine in the shared workspace with independent inputs and rules, an explorer, side-by-side and structure views, and keyboard and theme coverage. Phase 3C adds evidence-linked session matching, batch work, validated local profiles, and configurable redacted reports. Phase 3D adds explicit local transfers from Log Inspector and entitlement integration. Future product opportunities include account-backed entitlements and scheduled regression monitoring.
