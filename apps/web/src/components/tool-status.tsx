import type { ToolDefinition } from "@stack-workbench/shared";

export function ToolStatus({
  status,
}: {
  status: ToolDefinition["availability"];
}) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-1 text-sm font-semibold text-accent">
      {status === "planned" ? "Planned" : "Available"}
    </span>
  );
}
