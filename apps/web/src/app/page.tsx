import Link from "next/link";
import { toolCategories } from "@stack-workbench/shared";
import { buttonVariants } from "@stack-workbench/ui/button";
import { CategoryIcon } from "@/components/category-icon";
import { LogExample } from "@/components/log-example";
import { ToolStatus } from "@/components/tool-status";
import { findTool } from "@/lib/tools";

export default function HomePage() {
  const firstTool = findTool("log-inspector");

  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_0.96fr] lg:gap-14 lg:py-22">
          <div>
            <h1 className="max-w-[13ch] text-4xl leading-[1.04] font-bold tracking-[-0.05em] sm:text-6xl">
              Developer tools for{" "}
              <span className="text-accent">real systems.</span>
            </h1>
            <p className="mt-5 max-w-[45ch] text-lg leading-relaxed text-muted-foreground">
              A privacy-first workbench for troubleshooting applications, APIs,
              and integrations. Start with the tools you need and keep sensitive
              inputs in your browser whenever possible.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/tools" className={buttonVariants()}>
                Explore tools
              </Link>
              <Link
                href="/privacy"
                className={buttonVariants({ variant: "outline" })}
              >
                How we handle data
              </Link>
            </div>
          </div>
          <LogExample />
        </div>
      </section>
      <div className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-8 lg:py-12">
        <section aria-labelledby="categories-heading">
          <h2
            id="categories-heading"
            className="text-2xl font-bold tracking-tight"
          >
            Browse by category
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {toolCategories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/tools#${category.id}`}
                  className="block h-full rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent sm:p-5"
                >
                  <CategoryIcon category={category.id} />
                  <h3 className="mt-3 text-lg font-semibold">
                    {category.name}
                  </h3>
                  <p className="mt-1 leading-snug text-muted-foreground">
                    {category.description}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {firstTool && (
          <section
            aria-labelledby="first-tool-heading"
            className="flex flex-wrap items-center justify-between gap-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
          >
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2
                  id="first-tool-heading"
                  className="text-xl font-bold tracking-tight"
                >
                  {firstTool.name}
                </h2>
                <ToolStatus status={firstTool.availability} />
              </div>
              <p className="mt-2 text-muted-foreground">
                {firstTool.description}
              </p>
            </div>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/tools/${firstTool.slug}`}
            >
              Open Log Inspector
            </Link>
          </section>
        )}
      </div>
    </>
  );
}
