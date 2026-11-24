import { parseLogs } from "@stack-workbench/log-parser";
import { samples } from "./samples";

export function getLogPreview() {
  // This entry point accepts no input and only parses the bundled synthetic fixture.
  const { events, summary } = parseLogs(samples[0].text, "auto");
  return {
    events: events.map(({ index, timestamp, level, message }) => ({
      index,
      time: timestamp?.utc?.slice(11, 23),
      level,
      message,
    })),
    payloads: summary.payloads,
    exceptions: summary.exceptions,
  };
}
