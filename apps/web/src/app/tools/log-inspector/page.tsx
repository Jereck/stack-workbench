import type { Metadata } from "next";
import { LogInspector } from "@stack-workbench/log-inspector";
import { LogInspectorGuide } from "@/components/log-inspector-guide";
import { ToolPage } from "@/components/tool-page";
import { findTool } from "@/lib/tools";

const tool = findTool("log-inspector");
if (!tool) throw new Error("Log Inspector is missing from the tool registry.");

export const metadata: Metadata = tool.seo;

export default function LogInspectorPage() {
  return (
    <ToolPage tool={tool!}>
      <LogInspector />
      <LogInspectorGuide />
    </ToolPage>
  );
}
