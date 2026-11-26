import { useEffect, useRef, useState } from "react";
import { Button } from "@stack-workbench/ui/button";
import { controlClass } from "@stack-workbench/ui/workspace";
import { download } from "./download";
import type { ReportData, ReportFormat } from "./report";
import { startReport } from "./worker-client";
import { useCompareAccess } from "./access-context";
import { hasCapability } from "@stack-workbench/shared/entitlements";
import { ProFeature } from "./pro-feature";

const extensions = {
  json: "json",
  csv: "csv",
  markdown: "md",
  html: "html",
} as const;

export function ReportPanel({ report }: { report: () => ReportData }) {
  const access = useCompareAccess();
  return hasCapability(access, "compare.reporting") ? (
    <ReportForm report={report} />
  ) : (
    <ProFeature capability="compare.reporting" disclosure />
  );
}

function ReportForm({ report }: { report: () => ReportData }) {
  const access = useCompareAccess();
  const [format, setFormat] = useState<ReportFormat>("markdown");
  const [includeValues, setIncludeValues] = useState(false);
  const [redact, setRedact] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<ReturnType<typeof startReport> | undefined>(undefined);

  useEffect(
    () => () => {
      active.current?.cancel();
      active.current = undefined;
    },
    [],
  );

  function save() {
    const job = startReport(
      report(),
      { format, includeValues, redact },
      access,
    );
    active.current = job;
    setBusy(true);
    setMessage("Preparing report locally…");
    void job.result.then((outcome) => {
      if (active.current !== job) return;
      active.current = undefined;
      setBusy(false);
      if (outcome.status !== "completed") {
        setMessage("Could not prepare this report.");
        return;
      }
      download(
        outcome.result,
        "integration-compare-report." + extensions[format],
      );
      setMessage(
        format === "html"
          ? "Open the downloaded report in a browser to print it."
          : "Report downloaded.",
      );
    });
  }

  return (
    <details className="border-b border-border px-3 py-1.5">
      <summary className="cursor-pointer py-1 text-ui font-medium">
        Regression report
      </summary>
      <div className="space-y-2 py-2">
        <div className="flex flex-wrap items-center gap-3 text-ui">
          <select
            aria-label="Report format"
            value={format}
            className={controlClass + " w-auto!"}
            onChange={(event) => setFormat(event.target.value as ReportFormat)}
          >
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="html">Printable HTML</option>
          </select>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={includeValues}
              onChange={(event) => setIncludeValues(event.target.checked)}
            />{" "}
            Include captured values
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={redact}
              onChange={(event) => setRedact(event.target.checked)}
            />{" "}
            Apply redaction
          </label>
          <Button variant="outline" onClick={save} disabled={busy}>
            Download report
          </Button>
          {busy && (
            <Button
              variant="ghost"
              onClick={() => {
                active.current?.cancel();
                active.current = undefined;
                setBusy(false);
                setMessage("Report cancelled.");
              }}
            >
              Cancel report
            </Button>
          )}
        </div>
        <p className="text-label text-muted-foreground">
          Reports may contain sensitive labels, paths or values. Review the file
          before sharing it.
        </p>
        {message && (
          <p role="status" className="text-ui">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
