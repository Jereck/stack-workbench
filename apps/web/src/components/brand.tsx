import { Terminal } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link
      href="/"
      className="inline-flex min-h-8 shrink-0 items-center gap-2 rounded-control text-sm font-semibold tracking-tight"
    >
      <span className="grid size-7 place-items-center rounded-control border border-border bg-surface-muted text-accent">
        <Terminal size={16} aria-hidden />
      </span>
      StackWorkbench
    </Link>
  );
}
