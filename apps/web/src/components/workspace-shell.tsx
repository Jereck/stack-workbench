"use client";

import {
  ChevronRight,
  FileText,
  LockKeyhole,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import Link from "next/link";
import { useId, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { toolCategories } from "@stack-workbench/shared";
import type { ToolDefinition } from "@stack-workbench/shared";
import { Button } from "@stack-workbench/ui/button";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const sidebarKey = "stack-workbench-sidebar";
const processingLabels = {
  browser: "On-device processing",
  server: "Server processing",
  hybrid: "Browser and server processing",
};
const preferenceEvent = "stack-workbench-sidebar-change";
let fallback: boolean | undefined;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(preferenceEvent, onChange);
  const media = window.matchMedia("(min-width: 768px)");
  media.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(preferenceEvent, onChange);
    media.removeEventListener("change", onChange);
  };
}

function readSidebar() {
  if (fallback !== undefined) return fallback;
  try {
    const saved = localStorage.getItem(sidebarKey);
    if (saved === "expanded" || saved === "collapsed")
      return saved === "expanded";
  } catch {
    // The layout still works when preference storage is unavailable.
  }
  return window.matchMedia("(min-width: 768px)").matches;
}

function saveSidebar(expanded: boolean) {
  try {
    localStorage.setItem(sidebarKey, expanded ? "expanded" : "collapsed");
  } catch {
    fallback = expanded;
  }
  window.dispatchEvent(new Event(preferenceEvent));
}

export function WorkspaceShell({
  tool,
  tools,
  guide,
  children,
}: {
  tool: ToolDefinition;
  tools: ToolDefinition[];
  guide?: ReactNode;
  children: ReactNode;
}) {
  const expanded = useSyncExternalStore(
    subscribe,
    readSidebar,
    () => undefined,
  );
  const navigationId = useId();
  const guideId = useId();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const category = toolCategories.find(({ id }) => id === tool.category);
  const inactive = expanded === false;

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-surface">
      <header className="flex min-h-11 flex-wrap items-center gap-x-2 border-b border-border bg-sidebar px-3 py-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Tool sidebar"
          title="Toggle tool sidebar"
          aria-expanded={expanded}
          aria-controls={navigationId}
          onClick={() => saveSidebar(!readSidebar())}
        >
          {expanded ? (
            <PanelLeftClose size={16} aria-hidden />
          ) : (
            <PanelLeft size={16} aria-hidden />
          )}
        </Button>
        <Brand />
        <span className="ml-auto flex items-center gap-1.5 text-label text-muted-foreground">
          {tool.processing === "browser" && (
            <LockKeyhole size={13} className="text-success" aria-hidden />
          )}
          <span className="sr-only min-[420px]:not-sr-only">
            {processingLabels[tool.processing]}
          </span>
        </span>
        <ThemeToggle />
      </header>
      <div
        className={
          "grid min-w-0 items-stretch " +
          (inactive ? "" : "md:grid-cols-[var(--workspace-rail)_minmax(0,1fr)]")
        }
      >
        <aside
          id={navigationId}
          className={
            "min-w-0 border-b border-border bg-sidebar px-3 py-3 md:border-r md:border-b-0 " +
            (inactive ? "hidden" : expanded ? "" : "hidden md:block")
          }
        >
          <nav aria-label="Workspace tools" className="space-y-3">
            <Link
              href="/tools"
              className="flex min-h-8 items-center justify-between rounded-control px-2 text-ui font-medium hover:bg-surface-muted"
            >
              All tools <ChevronRight size={14} aria-hidden />
            </Link>
            {toolCategories.map(({ id, name }) => {
              const group = tools.filter((entry) => entry.category === id);
              if (group.length === 0) return null;
              return (
                <div key={id}>
                  <p className="px-2 pb-1.5 text-label font-medium text-muted-foreground">
                    {name}
                  </p>
                  <ul className="space-y-1">
                    {group.map((entry) => (
                      <li key={entry.id}>
                        <Link
                          href={"/tools/" + entry.slug}
                          aria-current={
                            entry.id === tool.id ? "page" : undefined
                          }
                          className="flex min-h-8 items-center gap-2 rounded-control px-2 text-ui hover:bg-surface-muted aria-[current=page]:bg-accent-soft aria-[current=page]:font-semibold aria-[current=page]:text-accent"
                        >
                          <FileText size={15} aria-hidden />
                          {entry.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div className="flex gap-3 border-t border-border px-2 pt-3 text-label text-muted-foreground">
              <Link href="/about" className="hover:underline">
                About
              </Link>
              <Link href="/privacy" className="hover:underline">
                Privacy
              </Link>
            </div>
          </nav>
        </aside>
        <div className="min-w-0 self-start">
          <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
            <span className="text-ui text-muted-foreground">
              {category?.name}
            </span>
            <ChevronRight
              size={14}
              aria-hidden
              className="text-muted-foreground"
            />
            <h1 className="text-sm font-semibold">{tool.name}</h1>
            {guide && (
              <a
                href={"#" + guideId}
                onClick={() => {
                  if (disclosure.current) disclosure.current.open = true;
                }}
                className="ml-auto rounded-control px-2 py-1 text-ui text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              >
                Format guide
              </a>
            )}
          </div>
          {children}
          {guide && (
            <details
              ref={disclosure}
              id={guideId}
              className="border-b border-border"
            >
              <summary className="cursor-pointer px-4 py-3 text-ui font-medium">
                {tool.name} guide
              </summary>
              {guide}
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
