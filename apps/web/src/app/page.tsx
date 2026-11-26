import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@stack-workbench/ui/button";
import { toolPricingLabels } from "@stack-workbench/shared";
import { LogExample } from "@/components/log-example";
import { CategoryIcon } from "@/components/category-icon";
import { listTools } from "@/lib/tools";

export default function HomePage() {
  const available = listTools().filter(
    (tool) => tool.availability === "available",
  );

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <section className="grid items-center gap-8 py-12 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-20">
        <div>
          <h1 className="max-w-[17ch] text-4xl leading-[1.08] font-semibold tracking-[-0.055em] sm:text-5xl">
            Developer tools for the systems you depend on.
          </h1>
          <p className="mt-4 max-w-[45ch] text-base leading-relaxed text-secondary">
            Search application logs, follow failed requests, and compare
            structured payloads in your browser.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link href="/tools/log-inspector" className={buttonVariants()}>
              Open Log Inspector <ArrowRight size={15} aria-hidden />
            </Link>
            <Link
              href="/tools"
              className={buttonVariants({ variant: "ghost" })}
            >
              Explore tools
            </Link>
          </div>
        </div>
        <LogExample />
      </section>

      <div className="grid gap-x-12 border-t border-border md:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="available-tools" className="py-6 sm:py-8">
          <h2
            id="available-tools"
            className="text-lg font-semibold tracking-tight"
          >
            Available tools
          </h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {available.map((tool) => (
              <li key={tool.id}>
                <Link
                  href={"/tools/" + tool.slug}
                  className="group flex min-h-14 items-center gap-3 px-2 py-3 hover:bg-surface-muted"
                >
                  <CategoryIcon category={tool.category} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                      {tool.name}
                      <span className="text-label font-normal text-muted-foreground">
                        {toolPricingLabels[tool.pricing]}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-ui text-muted-foreground">
                      {tool.description}
                    </span>
                  </span>
                  <ArrowRight
                    size={16}
                    className="ml-auto shrink-0 text-muted-foreground group-hover:text-accent"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="privacy-heading"
          className="border-t border-border py-6 sm:py-8 md:border-t-0"
        >
          <h2
            id="privacy-heading"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight"
          >
            <LockKeyhole size={17} className="text-success" aria-hidden /> Your
            data stays on this device
          </h2>
          <p className="mt-2 max-w-[42ch] text-sm leading-relaxed text-secondary">
            Log Inspector and Integration Compare process files in browser
            memory. Clear the workspace to discard your input and results.
          </p>
          <Link
            href="/privacy"
            className="mt-3 inline-flex min-h-8 items-center gap-1.5 text-ui font-medium text-accent hover:underline"
          >
            How we handle data <ArrowRight size={14} aria-hidden />
          </Link>
        </section>
      </div>
    </div>
  );
}
