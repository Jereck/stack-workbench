import type { Metadata } from "next";
import { WorkspaceShell } from "@/components/workspace-shell";
import { IntegrationCompareEntry } from "@/components/integration-compare-entry";
import { getToolEntitlements } from "@/lib/entitlements";
import { findTool, listTools } from "@/lib/tools";

const tool = findTool("integration-compare");
if (!tool)
  throw new Error("Integration Compare is missing from the tool registry.");

export const metadata: Metadata = tool.seo;

export default function IntegrationComparePage() {
  return (
    <WorkspaceShell
      tool={tool!}
      tools={listTools().filter(
        ({ availability }) => availability === "available",
      )}
      guide={
        <div className="max-w-3xl space-y-2 px-4 pb-4 text-sm text-secondary">
          <h2 className="font-semibold text-foreground">
            Compare payloads and recorded requests
          </h2>
          <p>
            Compare a working baseline with a failing target to find changed
            values, field types, and missing records. Integration Compare Free
            supports JSON, XML and SOAP, and plain text, with side-by-side
            results and exact-path ignores.
          </p>
          <p>
            Paste text or open UTF-8 files up to 4 MiB per side. The browser
            detects each format. You can select a format manually or add rules
            to ignore expected changes such as a request ID.
          </p>
          <p>
            Pro includes HTTP and log-session comparison, advanced rules,
            identifier matching, observed structure, batch runs, local profiles,
            and reports. Pro subscriptions aren’t available yet.
          </p>
        </div>
      }
    >
      <IntegrationCompareEntry entitlements={getToolEntitlements()} />
    </WorkspaceShell>
  );
}
