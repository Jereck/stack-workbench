import { FileUp, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent } from "react";
import {
  inputExceedsLimit,
  inputFormats,
  logInputFormats,
  MAX_INPUT_BYTES,
} from "@stack-workbench/comparison-engine";
import type {
  InputFormat,
  LogFormat,
  Side,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import { controlClass } from "@stack-workbench/ui/workspace";
import { samples } from "./samples";
import { canUseFormat } from "./access";
import { useCompareAccess } from "./access-context";

export const sideNames = { baseline: "Baseline", target: "Target" } as const;
export const inputLimitMessage = "Use up to 4 MiB of UTF-8 text per side.";

export interface Draft {
  text: string;
  label: string;
  format: InputFormat;
  logFormat?: LogFormat;
  revision: number;
}

export type DraftEdit = Partial<Omit<Draft, "revision">>;

export interface InputNotice {
  text: string;
  kind: "info" | "error";
}

export function InputPanel({
  side,
  title: customTitle,
  onlyLogs = false,
  draft,
  roomy,
  detected,
  detectedLog,
  notice,
  reading,
  onEdit,
  onFile,
  onSample,
  onClear,
}: {
  side: Side;
  title?: string;
  onlyLogs?: boolean;
  draft: Draft;
  roomy: boolean;
  detected?: Exclude<InputFormat, "auto">;
  detectedLog?: Exclude<LogFormat, "auto">;
  notice?: InputNotice;
  reading: boolean;
  onEdit: (edit: DraftEdit) => void;
  onFile: (files: FileList) => void;
  onSample: (index: number) => void;
  onClear: () => void;
}) {
  const title = customTitle ?? sideNames[side];
  const access = useCompareAccess();
  const id = useId();
  const chooser = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  function fileDrag(event: DragEvent) {
    return event.dataTransfer.types.includes("Files");
  }

  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const { selectionStart, selectionEnd, value } = event.currentTarget;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    // A full replacement can preserve the original line endings from the clipboard.
    if (
      (selectionStart === 0 && selectionEnd === value.length) ||
      inputExceedsLimit(text)
    ) {
      event.preventDefault();
      onEdit({ text });
      return;
    }
    // Leave normal inserts to the native editor, but intercept an oversized one
    // before maxlength can truncate it without an explanation.
    if (
      value.length - (selectionEnd - selectionStart) + text.length >
      MAX_INPUT_BYTES / 3
    ) {
      const inserted =
        value.slice(0, selectionStart) +
        text.replace(/\r\n?/g, "\n") +
        value.slice(selectionEnd);
      if (inputExceedsLimit(inserted)) {
        event.preventDefault();
        onEdit({ text: inserted });
      }
    }
  }

  return (
    <section
      aria-labelledby={id + "-title"}
      onDragEnter={(event) => {
        if (!fileDrag(event)) return;
        event.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!fileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        if (!fileDrag(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        onFile(event.dataTransfer.files);
      }}
      className={
        "@container relative min-w-0 rounded-panel border bg-surface " +
        (dragging ? "border-accent ring-1 ring-accent" : "border-border")
      }
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
        <h2 id={id + "-title"} className="text-ui font-semibold">
          {title}
        </h2>
        <input
          key={draft.revision}
          aria-label={title + " label"}
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          placeholder={
            side === "baseline" ? "e.g. Before deploy" : "e.g. After deploy"
          }
          value={draft.label}
          onChange={(event) => onEdit({ label: event.target.value })}
          className={controlClass + " flex-1 basis-24 text-label"}
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label={"Clear " + side}
          title={"Clear " + side}
          disabled={!draft.text && !reading && !notice}
          onClick={onClear}
        >
          <X size={15} aria-hidden />
        </Button>
      </div>
      <textarea
        key={draft.revision}
        aria-label={title + " input"}
        aria-invalid={notice?.kind === "error" ? true : undefined}
        aria-describedby={id + "-status"}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        wrap="off"
        maxLength={MAX_INPUT_BYTES}
        value={draft.text}
        placeholder={"Paste " + side + " text or drop a file…"}
        onPaste={paste}
        onChange={(event) => onEdit({ text: event.target.value })}
        className={
          "block min-h-32 w-full resize-y overflow-auto border-y border-border bg-background px-3 py-2 font-mono text-[13px] leading-5 placeholder:text-muted-foreground focus-visible:outline-offset-[-2px] " +
          (roomy ? "h-72" : "h-40")
        }
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
        <input
          ref={chooser}
          type="file"
          aria-label={"Choose " + title.toLowerCase() + " file"}
          hidden
          onChange={(event) => {
            if (event.currentTarget.files) onFile(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <Button variant="outline" onClick={() => chooser.current?.click()}>
          <FileUp size={14} aria-hidden /> Open{" "}
          <span className="sr-only">{side} file</span>
        </Button>
        <select
          aria-label={title + " example"}
          className={controlClass + " w-24! max-w-full @[26rem]:w-auto!"}
          value=""
          onChange={(event) => {
            if (event.target.value) onSample(Number(event.target.value) - 1);
          }}
        >
          <option value="">Example…</option>
          {(onlyLogs ? [{ name: "Recorded session" }] : samples).map(
            ({ name }, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ),
          )}
        </select>
        {!onlyLogs && (
          <select
            aria-label={title + " format"}
            className={controlClass + " ml-auto w-auto! max-w-full"}
            value={draft.format}
            onChange={(event) =>
              onEdit({ format: event.target.value as InputFormat })
            }
          >
            {Object.entries(inputFormats).map(([value, label]) => {
              const allowed = canUseFormat(access, value as InputFormat);
              return (
                <option value={value} key={value} disabled={!allowed}>
                  {value === "auto" ? "Detect format" : label}
                  {!allowed && " · Pro"}
                </option>
              );
            })}
          </select>
        )}
        {draft.format === "log" && (
          <select
            aria-label={
              onlyLogs
                ? sideNames[side] + " session format"
                : title + " log format"
            }
            className={
              controlClass +
              " w-auto! " +
              (onlyLogs ? "max-w-[8.5rem] @[26rem]:max-w-full" : "max-w-full")
            }
            value={draft.logFormat ?? "auto"}
            onChange={(event) =>
              onEdit({ logFormat: event.target.value as LogFormat })
            }
          >
            {Object.entries(logInputFormats).map(([value, label]) => (
              <option key={value} value={value}>
                {value === "auto" ? "Detect log format" : label}
              </option>
            ))}
          </select>
        )}
      </div>
      <p
        id={id + "-status"}
        role="status"
        className={
          "min-h-6 px-3 pb-2 text-label " +
          (notice?.kind === "error" ? "text-danger" : "text-muted-foreground")
        }
      >
        {dragging
          ? "Drop to open on this side."
          : reading
            ? "Reading local file…"
            : [
                notice?.text,
                detected &&
                  (draft.format === "auto" ? "Detected " : "Parsed as ") +
                    (detectedLog
                      ? logInputFormats[detectedLog]
                      : inputFormats[detected]),
              ]
                .filter(Boolean)
                .join(" · ") || "UTF-8 text · up to 4 MiB"}
      </p>
    </section>
  );
}
