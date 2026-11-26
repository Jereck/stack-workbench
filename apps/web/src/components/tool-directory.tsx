"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toolCategories, toolPricingLabels } from "@stack-workbench/shared";
import type { ToolDefinition } from "@stack-workbench/shared";
import { controlClass, EmptyState } from "@stack-workbench/ui/workspace";
import { CategoryIcon } from "./category-icon";

function ToolRows({ tools }: { tools: ToolDefinition[] }) {
  return (
    <ul className="divide-y divide-border">
      {tools.map((tool) => (
        <li key={tool.id}>
          <Link
            href={"/tools/" + tool.slug}
            className="group flex min-h-14 items-center gap-3 py-2.5 pl-2 pr-3 hover:bg-surface-muted"
          >
            <CategoryIcon category={tool.category} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                {tool.name}
                <span className="text-label font-normal text-muted-foreground">
                  {toolPricingLabels[tool.pricing]}
                </span>
              </span>
              <span className="block text-ui text-muted-foreground">
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
  );
}

export function ToolDirectory({ tools }: { tools: ToolDefinition[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matching = tools.filter((tool) =>
    [tool.name, tool.description, tool.category].some((field) =>
      field.toLowerCase().includes(needle),
    ),
  );
  const available = matching.filter(
    (tool) => tool.availability === "available",
  );
  const planned = matching.filter((tool) => tool.availability === "planned");
  const visibleCategories = toolCategories.filter(
    ({ id }) => !needle || available.some((tool) => tool.category === id),
  );

  return (
    <div className="mt-6">
      <label className="relative block max-w-sm">
        <span className="sr-only">Search tools</span>
        <Search
          size={16}
          className="pointer-events-none absolute top-2.5 left-3 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={controlClass + " min-h-9 pl-9"}
          placeholder="Search tools…"
        />
      </label>
      {visibleCategories.length > 0 && (
        <nav
          aria-label="Tool categories"
          className="mt-4 flex flex-wrap gap-x-5 border-b border-border"
        >
          {visibleCategories.map(({ id, name }) => (
            <a
              key={id}
              href={"#" + id}
              className="inline-flex min-h-10 items-center text-ui font-medium text-secondary hover:text-accent"
            >
              {name}
            </a>
          ))}
        </nav>
      )}
      <p role="status" className="sr-only">
        {available.length} available and {planned.length} planned tools match.
      </p>
      {available.length === 0 && (
        <EmptyState title="No available tools found">
          Try a different name, category, or keyword.
        </EmptyState>
      )}
      {visibleCategories.map(({ id, name }) => {
        const group = available.filter((tool) => tool.category === id);
        return (
          <section
            key={id}
            id={id}
            aria-labelledby={id + "-heading"}
            className="grid scroll-mt-4 gap-1 border-b border-border py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)]"
          >
            <h2
              id={id + "-heading"}
              className="self-start py-2 text-ui font-semibold"
            >
              {name}
            </h2>
            {group.length ? (
              <ToolRows tools={group} />
            ) : (
              <p className="self-center py-2 text-ui text-muted-foreground">
                No available tools yet.
              </p>
            )}
          </section>
        );
      })}
      {planned.length > 0 && (
        <section aria-labelledby="roadmap-heading" className="mt-8">
          <h2
            id="roadmap-heading"
            className="border-b border-border pb-2 text-sm font-semibold"
          >
            Roadmap
          </h2>
          <ToolRows tools={planned} />
        </section>
      )}
    </div>
  );
}
