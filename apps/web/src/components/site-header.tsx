import Link from "next/link";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-3 px-5 py-2 sm:px-8">
        <Brand />
        <nav
          aria-label="Main"
          className="order-last flex w-full items-center gap-4 text-ui text-secondary sm:order-0 sm:ml-auto sm:w-auto"
        >
          <Link
            href="/tools"
            className="inline-flex min-h-8 items-center hover:text-accent"
          >
            Tools
          </Link>
          <Link
            href="/about"
            className="inline-flex min-h-8 items-center hover:text-accent"
          >
            About
          </Link>
          <Link
            href="/privacy"
            className="inline-flex min-h-8 items-center hover:text-accent"
          >
            Privacy
          </Link>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
