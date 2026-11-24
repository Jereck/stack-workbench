import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-2 sm:px-8">
        <p className="text-sm font-medium text-muted-foreground">
          StackWorkbench
        </p>
        <nav
          aria-label="Footer"
          className="flex items-center gap-5 text-sm font-medium text-muted-foreground"
        >
          <Link
            href="/privacy"
            className="inline-flex min-h-8 items-center rounded-sm hover:text-accent"
          >
            Privacy
          </Link>
          <Link
            href="/feedback"
            className="inline-flex min-h-8 items-center rounded-sm hover:text-accent"
          >
            Feedback
          </Link>
        </nav>
      </div>
    </footer>
  );
}
