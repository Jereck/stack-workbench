import type { ReactNode } from "react";
import Link from "next/link";
import { toolCategories } from "@stack-workbench/shared";
import type { ToolDefinition } from "@stack-workbench/shared";
import { CategoryIcon } from "./category-icon";
import { ToolStatus } from "./tool-status";

const processingLabels = {
  browser: "In your browser",
  server: "On the server",
  hybrid: "Browser and server",
} satisfies Record<ToolDefinition["processing"], string>;

const pricingLabels = {
  free: "Free",
  professional: "Professional",
  team: "Team",
  business: "Business",
} satisfies Record<ToolDefinition["pricing"], string>;

export function ToolPage({
  tool,
  children,
}: {
  tool: ToolDefinition;
  children: ReactNode;
}) {
  const category = toolCategories.find(({ id }) => id === tool.category);
  const planned = tool.availability === "planned";

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="Breadcrumb" className="mb-5 text-ui font-medium">
        <Link
          href={`/tools#${tool.category}`}
          className="rounded-sm text-accent hover:underline"
        >
          Tools / {category?.name}
        </Link>
      </nav>
      <div className="max-w-3xl">
        <div className="mb-5 flex items-center gap-3">
          <CategoryIcon category={tool.category} />
          <ToolStatus status={tool.availability} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{tool.name}</h1>
        <p className="mt-3 text-base leading-relaxed text-secondary">
          {tool.description}
        </p>
      </div>
      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-3">
        <div>
          <dt className="text-sm text-muted-foreground">
            {planned ? "Planned processing" : "Processing"}
          </dt>
          <dd className="mt-1 font-semibold">
            {processingLabels[tool.processing]}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {planned ? "Planned tier" : "Tier"}
          </dt>
          <dd className="mt-1 font-semibold">{pricingLabels[tool.pricing]}</dd>
        </div>
      </dl>
      <div className="mt-6">{children}</div>
    </div>
  );
}
