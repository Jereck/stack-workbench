import { InformationSection } from "./information-page";

export function LogInspectorGuide() {
  return (
    <article
      aria-labelledby="log-guide-title"
      className="grid gap-4 border-t border-border p-4 md:grid-cols-2"
    >
      <h2
        id="log-guide-title"
        className="text-base font-semibold tracking-tight md:col-span-2"
      >
        Troubleshoot logs in your browser
      </h2>
      <InformationSection level={3} title="Supported log formats">
        <p>
          Open plain-text application logs, JSON objects and arrays, JSON Lines
          (NDJSON), compact or timestamped Serilog logs, and common CloudWatch
          JSON exports. Recognized multiline exceptions stay with their event.
          Malformed records remain available as raw text. Files must be UTF-8
          and 4 MiB or smaller.
        </p>
      </InformationSection>
      <InformationSection level={3} title="Follow a failed API request">
        <p>
          Paste a log, open a local file, or load the synthetic API example.
          Choose Parse logs, filter for errors, then open an event to see its
          status, request IDs, and any decoded JSON, XML, or SOAP bodies. Use
          Correlations to follow an exact trace, request, or correlation ID.
        </p>
      </InformationSection>
      <InformationSection level={3} title="Find what caused an exception">
        <p>
          Open Exceptions and expand the failing event for its stack trace and
          nested causes. Sort by timestamp to compare events with known
          timezones. Events with missing or ambiguous timestamps keep their
          original order at the end of the timeline.
        </p>
      </InformationSection>
      <InformationSection level={3} title="Keep logs on your device">
        <p>
          Log Inspector processes input in memory on your device. It has no
          account, upload, or saved history. Clear the workspace to discard
          input and results. Export selected or filtered events as JSON or text,
          and review any redacted download before sharing it.
        </p>
      </InformationSection>
    </article>
  );
}
