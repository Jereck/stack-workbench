import type { Metadata } from "next";
import Link from "next/link";
import { toolCategories } from "@stack-workbench/shared";
import { CategoryIcon } from "@/components/category-icon";
import { ToolStatus } from "@/components/tool-status";
import { listTools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Browse the StackWorkbench directory by Inspect, Compare, Validate, and Monitor.",
};

export default function ToolsPage() {
  const tools = listTools();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-18">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Tools</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Explore the directory for troubleshooting applications and integrations.
        {tools.every((tool) => tool.availability === "planned") &&
          " There are no tools available yet."}
      </p>
      <nav
        aria-label="Tool categories"
        className="mt-6 flex flex-wrap gap-x-5 gap-y-1"
      >
        {toolCategories.map((category) => (
          <a
            key={category.id}
            href={`#${category.id}`}
            className="inline-flex min-h-11 items-center rounded-sm font-semibold text-accent hover:underline"
          >
            {category.name}
          </a>
        ))}
      </nav>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {toolCategories.map((category) => {
          const categoryTools = tools.filter(
            (tool) => tool.category === category.id,
          );

          return (
            <section
              key={category.id}
              id={category.id}
              aria-labelledby={`${category.id}-heading`}
              className="scroll-mt-5 rounded-xl border border-border bg-surface p-5 sm:p-6"
            >
              <div className="flex items-center gap-3">
                <CategoryIcon category={category.id} />
                <h2
                  id={`${category.id}-heading`}
                  className="text-xl font-semibold tracking-tight"
                >
                  {category.name}
                </h2>
              </div>
              <p className="mt-3 text-muted-foreground">
                {category.description}
              </p>
              {categoryTools.length === 0 ? (
                <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
                  No tools listed yet.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-border border-t border-border">
                  {categoryTools.map((tool) => (
                    <li key={tool.id} className="pt-4 pb-3 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/tools/${tool.slug}`}
                          className="rounded-sm font-semibold text-accent underline-offset-4 hover:underline"
                        >
                          {tool.name}
                        </Link>
                        <ToolStatus status={tool.availability} />
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        {tool.description}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
