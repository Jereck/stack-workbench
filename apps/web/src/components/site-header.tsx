import { Terminal } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 rounded-md font-bold tracking-tight"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Terminal size={21} aria-hidden />
          </span>
          StackWorkbench
        </Link>
        <nav
          aria-label="Main"
          className="order-last flex w-full items-center gap-5 text-sm font-medium text-muted-foreground sm:order-0 sm:ml-auto sm:w-auto"
        >
          <Link
            href="/tools"
            className="inline-flex min-h-11 items-center rounded-sm hover:text-accent"
          >
            Tools
          </Link>
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center rounded-sm hover:text-accent"
          >
            About
          </Link>
          <Link
            href="/privacy"
            className="inline-flex min-h-11 items-center rounded-sm hover:text-accent"
          >
            Privacy
          </Link>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
