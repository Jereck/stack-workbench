"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formats, MAX_INPUT_BYTES } from "@stack-workbench/log-parser";
import type {
  LogEvent,
  LogFormat,
  LogResult,
} from "@stack-workbench/log-parser";
import type { RedactionCategory } from "@stack-workbench/redaction-engine";
import { Button } from "@stack-workbench/ui/button";
import { Editor } from "./editor";
import type { LogEditor } from "./editor";
import { Explorer, controlClass } from "./explorer";
import type { ExportFormat } from "./export";
import { samples } from "./samples";
import { ResultSummary } from "./summary";
import type { WorkerReply, WorkerRequest } from "./worker";

type Operation = "read" | WorkerRequest["type"];
type Job = { type: Operation; dispose: () => void };
const limitMessage = "Logs must be 4 MiB or smaller.";

export function LogInspector() {
  const editor = useRef<LogEditor>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const original = useRef<string | null>(null);
  const active = useRef<Job | null>(null);
  const downloads = useRef(new Map<string, number>());
  const [ready, setReady] = useState(false);
  const [hasInput, setHasInput] = useState(false);
  const [format, setFormat] = useState<LogFormat>("auto");
  const [result, setResult] = useState<LogResult>();
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Operation>();
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);

  const stop = useCallback(() => {
    const job = active.current;
    active.current = null;
    job?.dispose();
  }, []);

  const releaseDownloads = useCallback(() => {
    for (const [url, timer] of downloads.current) {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    downloads.current.clear();
  }, []);

  useEffect(
    () => () => {
      stop();
      releaseDownloads();
    },
    [stop, releaseDownloads],
  );

  const changed = useCallback(
    (nonempty: boolean) => {
      original.current = null;
      setHasInput(nonempty);
      setDirty(true);
      const operation = active.current?.type;
      if (operation === "parse" || operation === "read") {
        stop();
        setBusy(undefined);
        setNotice(
          operation === "parse"
            ? "Parsing cancelled because the input changed."
            : "File read cancelled because the input changed.",
        );
      }
    },
    [stop],
  );
  const editorReady = useCallback(() => setReady(true), []);
  const rememberPaste = useCallback((text: string) => {
    original.current = text;
  }, []);
  const pasteLimit = useCallback(() => setNotice(limitMessage), []);

  function clear() {
    stop();
    releaseDownloads();
    editor.current?.setValue("");
    original.current = null;
    if (fileInput.current) fileInput.current.value = "";
    setHasInput(false);
    setResult(undefined);
    setFormat("auto");
    setDirty(false);
    setBusy(undefined);
    setNotice("Workspace cleared.");
    setDragging(false);
    editor.current?.focus();
  }

  function setText(text: string) {
    editor.current?.setValue(text);
    original.current = text;
    setHasInput(Boolean(text));
    setDirty(true);
  }

  function readFile(file: File) {
    if (!ready || active.current) return;
    if (file.size > MAX_INPUT_BYTES) {
      setNotice(limitMessage);
      return;
    }
    const reader = new FileReader();
    const job: Job = {
      type: "read",
      dispose: () => {
        if (reader.readyState === reader.LOADING) reader.abort();
      },
    };
    active.current = job;
    setBusy("read");
    setNotice("Reading the local file…");
    reader.onloadend = () => {
      if (active.current !== job) return;
      stop();
      setBusy(undefined);
      try {
        if (!(reader.result instanceof ArrayBuffer)) throw new Error();
        const text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(reader.result);
        setText(text);
        setNotice(
          text.trim()
            ? "Local file loaded. Parse logs to inspect it."
            : "The local file contains no log text.",
        );
      } catch {
        setNotice(
          "The file could not be read as UTF-8 text. Your previous input is still available.",
        );
      }
    };
    try {
      reader.readAsArrayBuffer(file);
    } catch {
      stop();
      setBusy(undefined);
      setNotice(
        "The file could not be opened. Your previous input is still available.",
      );
    }
  }

  function download(blob: Blob, exportFormat: ExportFormat) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "log-inspector." + (exportFormat === "json" ? "json" : "txt");
    downloads.current.set(
      url,
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        downloads.current.delete(url);
      }, 1_000),
    );
    link.click();
  }

  function run(request: WorkerRequest) {
    if (active.current) return;
    const failure =
      request.type === "parse"
        ? "Parsing failed. Your input is still available. Try again or use a smaller log."
        : "Export failed. Your results are still available. Try again with fewer events.";
    setBusy(request.type);
    setNotice(
      request.type === "parse"
        ? "Parsing logs on this device…"
        : "Preparing the local download…",
    );
    try {
      const worker = new Worker(new URL("./worker.ts", import.meta.url));
      const job: Job = {
        type: request.type,
        dispose: () => worker.terminate(),
      };
      active.current = job;
      const fail = () => {
        if (active.current !== job) return;
        stop();
        setBusy(undefined);
        setNotice(failure);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail();
      };
      worker.onmessageerror = fail;
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (active.current !== job) return;
        stop();
        setBusy(undefined);
        if (data.type === "parsed") {
          setResult(data.result);
          setDirty(false);
          setRevision((current) => current + 1);
          const count = data.result.events.length;
          setNotice(
            "Parsed " +
              count.toLocaleString() +
              (count === 1 ? " event" : " events") +
              " in " +
              data.duration.toFixed(1) +
              " ms.",
          );
        } else if (data.type === "exported") {
          try {
            download(data.blob, data.format);
            setNotice("Download started.");
          } catch {
            setNotice(failure);
          }
        } else {
          setNotice(data.limit ? limitMessage : failure);
        }
      };
      worker.postMessage(request);
    } catch {
      stop();
      setBusy(undefined);
      setNotice(failure);
    }
  }

  function parse() {
    if (!editor.current) return;
    const model = editor.current.getModel();
    if (!model) return;
    const text = original.current ?? model.getValue(undefined, true);
    if (text.length > MAX_INPUT_BYTES) {
      setNotice(limitMessage);
      return;
    }
    if (!text.trim()) {
      setNotice("Enter some log text before parsing.");
      return;
    }
    run({ type: "parse", text, format });
  }

  function exportEvents(
    events: LogEvent[],
    exportFormat: ExportFormat,
    categories: RedactionCategory[],
  ) {
    run({ type: "export", events, format: exportFormat, categories });
  }

  let indicator = "Automatic format detection runs when you parse.";
  if (format !== "auto") indicator = "Format override · " + formats[format];
  else if (result && !dirty) indicator = "Detected · " + formats[result.format];

  return (
    <div id="log-workbench" className="min-w-0 scroll-mt-6 space-y-5">
      <section
        aria-labelledby="log-input-title"
        className={
          "min-w-0 rounded-xl border bg-surface " +
          (dragging ? "border-accent ring-2 ring-accent" : "border-border")
        }
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = ready && !busy ? "copy" : "none";
          if (ready && !busy) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            setDragging(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length !== 1)
            setNotice("Choose one log file at a time.");
          else if (event.dataTransfer.files[0])
            readFile(event.dataTransfer.files[0]);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div>
            <h2 id="log-input-title" className="text-lg font-semibold">
              Log input
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Paste text or drop a UTF-8 log file here. Up to 4 MiB.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!ready || Boolean(busy)}
            onClick={() => fileInput.current?.click()}
          >
            Open local file
          </Button>
          <input
            ref={fileInput}
            hidden
            type="file"
            aria-label="Choose log file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) readFile(file);
            }}
          />
        </div>
        <div className="border-y border-border bg-background">
          <Editor
            editorRef={editor}
            onChange={changed}
            onReady={editorReady}
            onOriginalPaste={rememberPaste}
            onPasteLimit={pasteLimit}
          />
        </div>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor="log-format">Log format</label>
              <select
                id="log-format"
                className={controlClass}
                value={format}
                disabled={Boolean(busy)}
                onChange={(event) => {
                  setFormat(event.target.value as LogFormat);
                  setDirty(true);
                }}
              >
                {Object.entries(formats).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 text-sm font-medium">
              <label htmlFor="log-example">Load synthetic example</label>
              <select
                id="log-example"
                className={controlClass}
                value=""
                disabled={!ready || Boolean(busy)}
                onChange={(event) => {
                  const sample = samples.find(
                    ({ id }) => id === event.target.value,
                  );
                  if (!sample) return;
                  setText(sample.text);
                  setFormat("auto");
                  setNotice("Example loaded. Parse logs to inspect it.");
                }}
              >
                <option value="" disabled>
                  Choose an example
                </option>
                {samples.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!ready || !hasInput || Boolean(busy)}
              onClick={parse}
            >
              Parse logs
            </Button>
            {busy && (
              <Button
                variant="outline"
                onClick={() => {
                  stop();
                  setBusy(undefined);
                  setNotice("Operation cancelled.");
                }}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={!hasInput && !result && !busy}
              onClick={clear}
            >
              Clear workspace
            </Button>
            <p className="text-xs text-muted-foreground sm:ml-auto">
              {indicator}
            </p>
          </div>
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        </div>
      </section>
      {result && (
        <div className="min-w-0 space-y-4">
          {dirty && (
            <p className="rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm">
              Showing results from the last parse. Parse again to include your
              changes.
            </p>
          )}
          <ResultSummary result={result} />
          <Explorer
            key={revision}
            result={result}
            busy={Boolean(busy)}
            onExport={exportEvents}
          />
        </div>
      )}
    </div>
  );
}
