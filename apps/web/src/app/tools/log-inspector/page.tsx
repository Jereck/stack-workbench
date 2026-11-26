import type { Metadata } from "next";
import { LogInspectorGuide } from "@/components/log-inspector-guide";
import { WorkspaceShell } from "@/components/workspace-shell";
import { LogInspectorEntry } from "@/components/log-inspector-entry";
import { getToolEntitlements } from "@/lib/entitlements";
import { findTool, listTools } from "@/lib/tools";

const tool = findTool("log-inspector");
if (!tool) throw new Error("Log Inspector is missing from the tool registry.");

export const metadata: Metadata = tool.seo;

export default function LogInspectorPage() {
  return (
    <WorkspaceShell
      tool={tool!}
      tools={listTools().filter((entry) => entry.availability === "available")}
      guide={<LogInspectorGuide />}
    >
      <LogInspectorEntry entitlements={getToolEntitlements()} />
    </WorkspaceShell>
  );
}
