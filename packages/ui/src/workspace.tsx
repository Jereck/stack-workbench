import type { ComponentProps, ReactNode } from "react";

export const controlClass =
  "min-h-8 min-w-0 w-full rounded-control border border-control-border bg-surface px-2.5 py-1 text-ui text-foreground placeholder:text-muted-foreground disabled:opacity-60";

export const viewButtonClass =
  "inline-flex min-h-9 items-center rounded-t-control border-b-2 border-transparent px-2.5 text-ui font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent";

export function WorkspaceToolbar({
  className = "",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={
        "flex min-h-11 min-w-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-1.5 " +
        className
      }
      {...props}
    />
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-7 text-center">
      <p className="text-ui font-semibold">{title}</p>
      <p className="mt-1 text-ui text-muted-foreground">{children}</p>
    </div>
  );
}

export function KeyHint({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-sm border border-current px-1 font-mono text-[10px] leading-4 opacity-85">
      {children}
    </kbd>
  );
}
