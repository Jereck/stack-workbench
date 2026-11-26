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
import {
  controlClass,
  EmptyState,
  KeyHint,
  WorkspaceToolbar,
} from "@stack-workbench/ui/workspace";
import { Explorer } from "./explorer";
import type { ExportFormat } from "./export";
import { samples } from "./samples";
import { ResultSummary } from "./summary";
import type { WorkerReply, WorkerRequest } from "./worker";
import type {
  CompareHandoff,
  CompareSide,
  CompareTransfer,
} from "@stack-workbench/shared/tool-handoff";
import { CompareActions } from "./compare-actions";

type Operation = "read" | WorkerRequest["type"];
type Job = { type: Operation; dispose: () => void };
const limitMessage = "Logs must be 4 MiB or smaller.";

export function LogInspector({ handoff }: { handoff?: CompareHandoff } = {}) {
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
  const [expandedEditor, setExpandedEditor] = useState(false);
  const [collapsedInput, setCollapsedInput] = useState(false);
  const [transferError, setTransferError] = useState(false);
  const staged = handoff?.staged.map(
    ({ kind, side }) =>
      (kind === "payload" ? "Payload" : "Log session") + " as " + side,
  );

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
    handoff?.clear();
    setTransferError(false);
    setDragging(false);
    setCollapsedInput(false);
    setExpandedEditor(false);
    if (collapsedInput) requestAnimationFrame(() => editor.current?.focus());
    else editor.current?.focus();
  }

  function setText(text: string) {
    editor.current?.setValue(text);
    original.current = text;
    setHasInput(Boolean(text));
    setDirty(true);
    setCollapsedInput(false);
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

  function stage(transfer: CompareTransfer) {
    if (!handoff?.stage(transfer)) {
      setTransferError(true);
      return;
    }
    setTransferError(false);
  }

  function stageSession(side: CompareSide) {
    if (!result || dirty || busy || !handoff?.canStageSession) return;
    const text =
      original.current ?? editor.current?.getModel()?.getValue(undefined, true);
    if (text) stage({ kind: "session", side, text, logFormat: result.format });
  }

  let indicator = "Automatic format detection runs when you parse.";
  if (format !== "auto") indicator = "Format override · " + formats[format];
  else if (result && !dirty) indicator = "Detected · " + formats[result.format];

  return (
    <div
      id="log-workbench"
      className="min-w-0"
      onKeyDownCapture={(event) => {
        if (
          event.key !== "Enter" ||
          !(event.metaKey || event.ctrlKey) ||
          event.altKey ||
          event.shiftKey ||
          event.nativeEvent.isComposing
        )
          return;
        if (!ready || !hasInput || busy) return;
        event.preventDefault();
        event.stopPropagation();
        parse();
      }}
    >
      <section
        aria-labelledby="log-input-title"
        className={
          "relative min-w-0 border-b border-border " +
          (dragging ? "z-10 ring-2 ring-inset ring-accent" : "")
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
        <WorkspaceToolbar>
          <h2 id="log-input-title" className="mr-1 text-ui font-semibold">
            Log input
          </h2>
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
          <div className="w-42 max-w-full">
            <label htmlFor="log-example" className="sr-only">
              Load synthetic example
            </label>
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
                Load example
              </option>
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-41 max-w-full">
            <label htmlFor="log-format" className="sr-only">
              Log format
            </label>
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
          <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
            <Button
              variant="ghost"
              disabled={!hasInput && !result && !busy}
              onClick={clear}
            >
              Clear workspace
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
              disabled={!ready || !hasInput || Boolean(busy)}
              onClick={parse}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              title="Parse logs (Ctrl or Command + Enter)"
            >
              Parse logs{" "}
              <span aria-hidden className="hidden xl:inline">
                <KeyHint>Ctrl/⌘ ↵</KeyHint>
              </span>
            </Button>
          </div>
        </WorkspaceToolbar>
        <div
          id="log-editor-pane"
          hidden={collapsedInput}
          className="group relative bg-background"
        >
          <Editor
            editorRef={editor}
            onChange={changed}
            onReady={editorReady}
            onOriginalPaste={rememberPaste}
            onPasteLimit={pasteLimit}
            heightClass={
              expandedEditor
                ? "h-[min(52dvh,32rem)]"
                : result
                  ? "h-32"
                  : "h-48 sm:h-56"
            }
          />
          {ready && !hasInput && (
            <p
              aria-hidden
              className="pointer-events-none absolute top-3.5 left-10 font-mono text-label text-muted-foreground group-focus-within:hidden"
            >
              Paste logs here or drop a UTF-8 file.
            </p>
          )}
        </div>
        <div className="flex min-h-9 flex-wrap items-center gap-x-3 border-t border-border bg-sidebar px-3 text-label text-muted-foreground">
          <p role="status">{notice || "UTF-8 · Up to 4 MiB"}</p>
          <p className="sm:ml-auto">{indicator}</p>
          <div className="flex items-center gap-1">
            {!collapsedInput && (
              <Button
                size="default"
                variant="ghost"
                className="min-h-7 px-2 text-label"
                onClick={() => setExpandedEditor(!expandedEditor)}
              >
                {expandedEditor ? "Compact editor" : "Expand editor"}
              </Button>
            )}
            <Button
              variant="ghost"
              className="min-h-7 px-2 text-label"
              aria-controls="log-editor-pane"
              aria-expanded={!collapsedInput}
              onClick={() => setCollapsedInput(!collapsedInput)}
            >
              {collapsedInput ? "Show input" : "Hide input"}
            </Button>
          </div>
        </div>
      </section>
      {handoff && staged && (staged.length > 0 || transferError) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
          <p role="status" className="text-label text-muted-foreground">
            {transferError && "Could not stage this input. "}
            {staged.length > 0 &&
              staged.join(" · ") +
                " ready in this tab. A refresh clears the transfer."}
          </p>
          {staged.length > 0 && (
            <>
              <Button variant="outline" onClick={handoff.open}>
                Open Integration Compare
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  handoff.clear();
                  setTransferError(false);
                }}
              >
                Clear staged inputs
              </Button>
            </>
          )}
        </div>
      )}
      {result ? (
        <div className="min-w-0">
          {handoff?.canStageSession && result.events.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
              <CompareActions
                source="session"
                onSelect={stageSession}
                disabled={dirty || Boolean(busy)}
              />
              {dirty && (
                <span className="text-label text-muted-foreground">
                  Parse again to send the current session.
                </span>
              )}
            </div>
          )}
          {dirty && (
            <p className="border-b border-border bg-warning-soft px-3 py-2 text-ui text-warning">
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
            onTransfer={handoff ? stage : undefined}
          />
        </div>
      ) : (
        <div className="border-b border-border">
          <EmptyState title={hasInput ? "No parsed events" : "No input yet"}>
            {hasInput
              ? "Parse the input to search events, inspect payloads, and follow exceptions."
              : "Paste logs, open a local file, or load an example to get started."}
          </EmptyState>
        </div>
      )}
    </div>
  );
}
