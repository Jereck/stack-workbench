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
    <article className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-secondary">
          {summary}
        </p>
      </header>
      <div className="mt-8 grid max-w-3xl gap-5">{children}</div>
    </article>
  );
}

export function InformationSection({
  title,
  children,
  level = 2,
}: {
  title: string;
  children: ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section className="border-t border-border pt-4">
      <Heading className="text-base font-semibold tracking-tight">
        {title}
      </Heading>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-secondary">
        {children}
      </div>
    </section>
  );
}
