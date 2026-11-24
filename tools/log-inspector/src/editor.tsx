"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { editor } from "monaco-editor/editor/editor.api.js";
import { MAX_INPUT_BYTES } from "@stack-workbench/log-parser";

export type LogEditor = editor.IStandaloneCodeEditor;

export function Editor({
  editorRef,
  onChange,
  onReady,
  onOriginalPaste,
  onPasteLimit,
}: {
  editorRef: RefObject<LogEditor | null>;
  onChange: (hasInput: boolean) => void;
  onReady: () => void;
  onOriginalPaste: (text: string) => void;
  onPasteLimit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    globalThis.MonacoEnvironment = {
      getWorker: () =>
        new Worker(new URL("./monaco.worker.ts", import.meta.url)),
    };

    void import("monaco-editor/editor/editor.api.js")
      .then(({ editor }) => {
        if (!active || !host.current) return;
        const container = host.current;
        const root = document.documentElement;
        const preference = window.matchMedia("(prefers-color-scheme: dark)");
        function theme() {
          return root.dataset.theme === "dark" ||
            (root.dataset.theme !== "light" && preference.matches)
            ? "vs-dark"
            : "vs";
        }
        const instance = editor.create(host.current, {
          language: "plaintext",
          value: "",
          ariaLabel: "Raw log text",
          theme: theme(),
          automaticLayout: true,
          editContext: false,
          accessibilitySupport: "auto",
          contextmenu: false,
          links: false,
          wordBasedSuggestions: "off",
          occurrencesHighlight: "off",
          selectionHighlight: false,
          copyWithSyntaxHighlighting: false,
          dragAndDrop: false,
          dropIntoEditor: { enabled: false },
          pasteAs: { enabled: false },
          minimap: { enabled: false },
          stickyScroll: { enabled: false },
          lineNumbersMinChars: 3,
          renderWhitespace: "none",
          scrollBeyondLastLine: false,
          folding: false,
          padding: { top: 12, bottom: 12 },
          fontSize: 13,
          fontFamily: "Cascadia Code, Consolas, monospace",
          tabFocusMode: true,
          unicodeHighlight: {
            ambiguousCharacters: false,
            invisibleCharacters: false,
          },
        });
        editorRef.current = instance;
        const change = instance.onDidChangeModelContent(() =>
          onChange(Boolean(instance.getModel()?.getValueLength())),
        );
        function capturePaste(event: ClipboardEvent) {
          const text = event.clipboardData?.getData("text/plain");
          const model = instance.getModel();
          const selections = instance.getSelections();
          if (!text || !model || !selections) return;
          const selectedLength = selections.reduce(
            (total, selection) =>
              total + model.getValueLengthInRange(selection),
            0,
          );
          if (
            model.getValueLength() + text.length - selectedLength >
            MAX_INPUT_BYTES
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
            onPasteLimit();
            return;
          }
          if (
            selections.length !== 1 ||
            selectedLength !== model.getValueLength()
          )
            return;
          const version = model.getVersionId();
          queueMicrotask(() => {
            if (active && model.getVersionId() !== version)
              onOriginalPaste(text);
          });
        }
        container.addEventListener("paste", capturePaste, true);
        const setTheme = () => editor.setTheme(theme());
        const observer = new MutationObserver(setTheme);
        observer.observe(root, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });
        preference.addEventListener("change", setTheme);
        dispose = () => {
          observer.disconnect();
          preference.removeEventListener("change", setTheme);
          container.removeEventListener("paste", capturePaste, true);
          change.dispose();
          editorRef.current = null;
          instance.getModel()?.dispose();
          instance.dispose();
        };
        setState("ready");
        onReady();
      })
      .catch(() => {
        if (active) setState("failed");
      });

    return () => {
      active = false;
      dispose?.();
    };
  }, [editorRef, onChange, onReady, onOriginalPaste, onPasteLimit]);

  return (
    <div className="relative">
      {state !== "ready" && (
        <p
          className="absolute inset-x-4 top-4 text-sm text-muted-foreground"
          role="status"
        >
          {state === "loading"
            ? "Loading local editor…"
            : "The editor failed to load. Reload to try again."}
        </p>
      )}
      <div ref={host} className="h-60 w-full sm:h-72" />
    </div>
  );
}
