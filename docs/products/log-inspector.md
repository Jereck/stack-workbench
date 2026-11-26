# Log Inspector

**Status** · Browser-local MVP available at [`/tools/log-inspector`](../../apps/web/src/app/tools/log-inspector/page.tsx)

Log Inspector helps backend and application support engineers follow failing API calls, decode request and response bodies, and inspect exceptions. It runs entirely in the browser without an account or service.

## Workflow

1. Paste log text in the Monaco editor, open or drop one UTF-8 file, or select a synthetic example.
2. Choose **Parse logs** or press **Ctrl/Command + Enter** in the workbench. Use **Expand editor** for more input space or **Hide input** to give results more room. The detected format appears beside the actions. Choose a format override to parse again with a different interpretation. **Cancel** interrupts an active read, parse, or export.
3. Review severity totals, the timestamp range, payload and exception counts, and parsing warnings. Search messages, raw events, and decoded payload text. Combine severity and exact identifier filters with input order or timestamp sorting.
4. Open an event to inspect it in the detail pane. Switch between Overview, Properties, Payloads, Exception, and Raw event when available. On narrow screens the detail pane sits below the list. **Back to events** returns focus to the opened row. Open **Correlations** to follow an exact trace, correlation, or request ID. Groups are distinct by identifier type and include IDs found on a single event. Open **Exceptions** for events with recognized errors, nested causes, and stack traces.
5. Select events individually or by page, then download the selection or all filtered results as JSON or readable text. Redaction is enabled by default with independently configurable categories.

## Supported input

| Format                    | Supported records                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Plain text and mixed logs | Timestamp and severity prefixes, recognized stack-trace continuations, inline and multiline JSON or XML, and common HTTP body labels |
| JSON and NDJSON           | A JSON object, an array of records, or one record per line                                                                           |
| Serilog                   | Compact JSON fields and timestamped text with bracketed levels                                                                       |
| CloudWatch                | Common `events` and `logEvents` wrappers, recognized per-event records, and Logs Insights field-value rows                           |

Format detection tries a whole JSON container and then samples up to 32 non-empty lines. When a structured record fails to parse, the explorer keeps its raw text and surfaces a warning. A text override keeps JSON records as text. File input and a full replacement paste preserve the original text received by the browser. Editing in Monaco can normalize line endings. JSON arrays preserve original event value slices, and the editor retains the complete input including outer separators and envelopes.

Events expose the metadata present in supported fields and prefixes. Timeline sorting uses timestamps with explicit offsets and supported epoch values. Timestamp strings without a recognized offset remain visible with their original text and stay in input order after comparable timestamps. Plain-text pattern detection is heuristic. Custom text layouts, arbitrary field aliases, streaming input, and compressed files are outside the MVP.

Payloads include embedded or escaped JSON and XML, SOAP envelopes with SOAP 1.1 or 1.2 namespaces, and bodies in recognized HTTP fields and messages. Payloads keep the original encoded text when decoding changes it. DTDs and external entities are unsupported.

## Privacy and redaction

To start a comparison from an extracted JSON, XML, or SOAP payload, select **Send as baseline** or **Send as target** under **Compare this payload**. Stage both sides if needed, then select **Open Integration Compare**. The handoff uses the current tab and clears on refresh. Pro offers the same transfer for the complete original log text after a current successful parse. [Integration Compare workflow](integration-compare.md)

Input, filters, and parsed results live in browser memory. Log Inspector sends no log data, stores no log history, and makes no requests to URLs read from logs. Monaco and both worker entry points ship as same-origin assets. **Clear workspace** removes the input, editor undo history, and derived results from the application and cancels active work. Explicit copy and download actions create copies that remain on the device after clearing.

Redaction masks common Authorization headers and bearer tokens, API keys, passwords, client secrets, cookies, connection strings, and email addresses. It runs only on export copies and may mask an entire free-text value when it detects a sensitive field in an ambiguous representation. Automated redaction can miss secrets in custom fields, formats, or encodings. Review the exported file before sharing it.

## Processing and display limits

| Limit                                                                           | Behavior                                                                                                                            |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 4 MiB of UTF-8, one file at a time                                              | Oversized input is rejected and the existing workspace remains available                                                            |
| 20,000 events                                                                   | If more records remain, the final row retains the remaining raw text                                                                |
| 48 JSON or XML container levels                                                 | Deep or structurally dense data remains accessible as raw text. JSON containers also have a 500,000 structural-marker limit         |
| 64 Ki UTF-16 code units per payload candidate                                   | Larger values remain accessible from the raw event or structured properties                                                         |
| Four recursive decoding steps and 12 property levels                            | Further traversal stops with a warning where a limit is reached                                                                     |
| 24 extracted payloads, 512 visits, and a 256 Ki code-unit scan budget per event | Extraction stops at the applicable limit. A total 4 Mi code-unit output budget applies across the workspace                         |
| 50 event or correlation rows per page                                           | The selected event and its active detail view render on demand. Large values have a selectable text preview and a full-value action |

## Benchmark

Run `pnpm build` and `pnpm start --hostname 127.0.0.1 --port 3100`, then run `node tests/bench/log-inspector.mjs` with Playwright Chromium installed. The runner generates three synthetic files and loads each through the local file workflow. [Benchmark script](../../tests/bench/log-inspector.mjs)

Measured with headless Chromium 159.0.8154.6 and Node.js 24.21.0 on Windows 11 with an AMD Ryzen 7 5800X. Each result uses five runs after one warm-up. Times are median with minimum and maximum in parentheses.

| Synthetic file                            |     Bytes | Events |    Worker parse, ms | Click to first rows, ms |
| ----------------------------------------- | --------: | -----: | ------------------: | ----------------------: |
| Serilog compact JSON                      |   262,129 |  1,583 |    27.1 (26.4–28.5) |        47.1 (45.7–48.6) |
| Serilog text with stack traces            | 1,048,559 |  9,949 |   92.5 (73.7–108.4) |     136.7 (112.7–153.5) |
| API integration NDJSON with nested bodies | 4,089,440 | 14,075 | 312.1 (310.3–340.8) |     436.2 (420.1–509.3) |

Worker parse time covers detection, normalization, extraction, and summary construction. Click-to-rows time starts after the file is loaded and ends when the first page appears in the DOM. It includes worker startup, result cloning, and UI rendering. These measurements describe one machine.

For processing boundaries and the worker lifecycle, see [ADR 0003](../decisions/0003-log-inspector-workers.md).
