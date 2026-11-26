"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { editor } from "monaco-editor/editor/editor.api.js";
import { inputExceedsLimit } from "@stack-workbench/log-parser";
import { limitEditorEdits } from "./editor-limit";

export type LogEditor = editor.IStandaloneCodeEditor;

export function Editor({
  editorRef,
  onChange,
  onReady,
  onOriginalPaste,
  onInputLimit,
  heightClass,
}: {
  editorRef: RefObject<LogEditor | null>;
  onChange: (hasInput: boolean) => void;
  onReady: () => void;
  onOriginalPaste: (text: string) => void;
  onInputLimit: () => void;
  heightClass: string;
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
          const dark =
            root.dataset.theme === "dark" ||
            (root.dataset.theme !== "light" && preference.matches);
          const styles = getComputedStyle(root);
          const resolve = (name: string) => {
            const value = styles.getPropertyValue(name);
            const colors = value.match(/#[0-9a-f]{6}/gi);
            return colors?.[dark ? 1 : 0] ?? value.trim();
          };
          editor.defineTheme("stack-workbench", {
            base: dark ? "vs-dark" : "vs",
            inherit: true,
            rules: [],
            colors: {
              "editor.background": resolve("--background"),
              "editor.foreground": resolve("--foreground"),
              "editorLineNumber.foreground": resolve("--muted-foreground"),
              "editorLineNumber.activeForeground": resolve("--foreground"),
              "editor.selectionBackground": resolve("--selected"),
              "editorCursor.foreground": resolve("--accent"),
            },
          });
          return "stack-workbench";
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
          fontFamily:
            "Geist Mono, JetBrains Mono, SFMono-Regular, Consolas, monospace",
          lineHeight: 21,
          renderLineHighlight: "none",
          overviewRulerBorder: false,
          tabFocusMode: true,
          unicodeHighlight: {
            ambiguousCharacters: false,
            invisibleCharacters: false,
          },
        });
        const model = instance.getModel();
        if (model) {
          model.setEOL(editor.EndOfLineSequence.LF);
          limitEditorEdits(model, onInputLimit);
        }
        void document.fonts
          .load('13px "Geist Mono"')
          .then(() => {
            if (active) editor.remeasureFonts();
          })
          .catch(() => undefined);
        editorRef.current = instance;
        const change = instance.onDidChangeModelContent(({ isFlush }) => {
          // Monaco can restore the platform default after replacing or clearing the text.
          if (isFlush) model?.setEOL(editor.EndOfLineSequence.LF);
          onChange(Boolean(model?.getValueLength()));
        });
        function capturePaste(event: ClipboardEvent) {
          const text = event.clipboardData?.getData("text/plain");
          const [selection, ...others] = instance.getSelections() ?? [];
          if (
            !text ||
            !model ||
            !selection ||
            others.length ||
            model.getValueLengthInRange(selection) !== model.getValueLength()
          )
            return;
          // A full paste can be parsed from the original clipboard text, including its line endings.
          if (inputExceedsLimit(text)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            onInputLimit();
            return;
          }
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
  }, [editorRef, onChange, onReady, onOriginalPaste, onInputLimit]);

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
      <div ref={host} className={"w-full " + heightClass} />
    </div>
  );
}
