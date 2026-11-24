import type { ToolDefinition } from "@stack-workbench/shared";

export const toolRegistry: readonly ToolDefinition[] = [
  {
    id: "log-inspector",
    name: "Log Inspector",
    description:
      "Search application logs, decode JSON and SOAP payloads, and trace failed requests in your browser.",
    slug: "log-inspector",
    category: "inspect",
    availability: "available",
    processing: "browser",
    pricing: "free",
    seo: {
      title: "Log Inspector",
      description:
        "Inspect plain-text, JSON, Serilog, and CloudWatch logs. Decode JSON, XML, and SOAP payloads and export redacted events entirely in your browser.",
    },
    order: 10,
  },
];

export function findTool(slug: string): ToolDefinition | undefined {
  return toolRegistry.find((tool) => tool.slug === slug);
}

export function listTools(): ToolDefinition[] {
  return [...toolRegistry].sort(
    (first, second) =>
      first.order - second.order || first.id.localeCompare(second.id),
  );
}
