import { useState } from "react";
import { Button } from "@stack-workbench/ui/button";

type Language = "JSON" | "XML" | "SOAP" | "Text";
const previewLength = 24_000;
const jsonToken =
  /("(?:\\[\s\S]|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|\b(true|false|null)\b/gi;
const xmlToken =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[\w:.-]+(?:[^<>"']|"[^"]*"|'[^']*')*>|&(?:#x[\da-f]+|#\d+|\w+);/gi;
const keyStyle = "text-[light-dark(#384fb0,#a9baff)]";
const stringStyle = "text-[light-dark(#26644c,#83d6ad)]";
const valueStyle = "text-[light-dark(#87500e,#f6c477)]";

function highlight(text: string, language: Language) {
  if (language === "Text") return text;
  const tokens = language === "JSON" ? jsonToken : xmlToken;
  const parts = [];
  let end = 0;
  for (const match of text.matchAll(tokens)) {
    if (parts.length > 4_000) {
      parts.push(text.slice(end));
      return parts;
    }
    if (match.index > end) parts.push(text.slice(end, match.index));
    const style =
      language === "JSON"
        ? match[2]
          ? keyStyle
          : match[1]
            ? stringStyle
            : valueStyle
        : match[0].startsWith("&")
          ? valueStyle
          : keyStyle;
    parts.push(
      <span className={style} key={match.index}>
        {match[0]}
      </span>,
    );
    end = match.index + match[0].length;
  }
  parts.push(text.slice(end));
  return parts;
}

export function prettyCode(text: string, language: Language): string {
  if (text.length > previewLength) return text;
  if (language === "JSON") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  if (language === "XML" || language === "SOAP") {
    const matched = [...text.matchAll(xmlToken)];
    // Keep mixed content and existing whitespace intact.
    if (
      matched.some(
        (match) => match[0].startsWith("&") || match[0].startsWith("<![CDATA["),
      )
    )
      return text;
    const lines: string[] = [];
    let end = 0;
    let depth = 0;
    for (const match of matched) {
      const gap = text.slice(end, match.index);
      if (gap.trim()) {
        // A text-only element fits on one line with its opening and closing tags.
        const last = lines.at(-1);
        if (
          !last ||
          !match[0].startsWith("</") ||
          !/^<[\w:.-]+(?:\s[^<>]*)?>$/.test(last.trim()) ||
          last.endsWith("/>")
        )
          return text;
        lines[lines.length - 1] = last + gap + match[0];
        depth = Math.max(0, depth - 1);
      } else {
        if (match[0].startsWith("</")) depth = Math.max(0, depth - 1);
        lines.push("  ".repeat(depth) + match[0]);
        if (/^<[\w:.-]/.test(match[0]) && !match[0].endsWith("/>")) depth++;
      }
      end = match.index + match[0].length;
    }
    if (end === text.length && lines.length) return lines.join("\n");
  }
  return text;
}

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
    } catch {
      setStatus("Clipboard unavailable");
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        className="min-h-9 px-3 py-1"
        variant="outline"
        onClick={() => void copy()}
      >
        {label}
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {status}
      </span>
    </span>
  );
}

export function CodeView({
  text,
  label,
  language = "Text",
}: {
  text: string;
  label: string;
  language?: Language;
}) {
  const [full, setFull] = useState(false);
  const display = prettyCode(text, language);
  const truncated = display.length > previewLength;
  const content = truncated
    ? full
      ? display
      : display.slice(0, previewLength)
    : display;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <CopyButton text={text} label={"Copy " + label.toLowerCase()} />
      </div>
      <pre
        aria-label={label}
        tabIndex={0}
        className="max-h-80 overflow-auto rounded-lg border border-border bg-surface-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere focus-visible:outline-2 focus-visible:outline-accent"
      >
        <code>
          {full && truncated ? content : highlight(content, language)}
        </code>
      </pre>
      {truncated && (
        <Button
          variant="ghost"
          aria-pressed={full}
          onClick={() => setFull(!full)}
        >
          {full ? "Show preview" : "Show full value"}
        </Button>
      )}
    </div>
  );
}
