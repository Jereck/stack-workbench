import type { Metadata } from "next";
import { ToolDirectory } from "@/components/tool-directory";
import { listTools } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Browse the StackWorkbench directory by Inspect, Compare, Validate, and Monitor.",
};

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Tools</h1>
      <p className="mt-2 text-sm text-secondary">
        Find the right tool for troubleshooting applications and integrations.
      </p>
      <ToolDirectory tools={listTools()} />
    </div>
  );
}
