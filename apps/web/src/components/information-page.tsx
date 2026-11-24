import type { ReactNode } from "react";

export function InformationPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-18">
      <header className="max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {summary}
        </p>
      </header>
      <div className="mt-8 grid max-w-3xl gap-6">{children}</div>
    </article>
  );
}

export function InformationSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-3 leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
