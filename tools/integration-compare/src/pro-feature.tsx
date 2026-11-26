import { LockKeyhole } from "lucide-react";
import type { Capability } from "@stack-workbench/shared/entitlements";
import { proFeatures } from "./access";

export function ProFeature({
  capability,
  disclosure = false,
}: {
  capability: Capability;
  disclosure?: boolean;
}) {
  const { title, description } = proFeatures[capability];
  const heading = (
    <>
      <LockKeyhole size={14} aria-hidden />
      {title}{" "}
      <span className="text-label font-normal text-muted-foreground">Pro</span>
    </>
  );
  const body = (
    <p className="text-ui text-muted-foreground">
      {description} Pro subscriptions aren’t available yet.
    </p>
  );
  return disclosure ? (
    <details className="border-b border-border px-3 py-1">
      <summary className="min-h-8 cursor-pointer py-1.5 text-ui font-medium">
        <span className="inline-flex items-center gap-1.5">{heading}</span>
      </summary>
      <div className="pb-2 pl-3">{body}</div>
    </details>
  ) : (
    <section
      aria-label={title}
      className="space-y-1 border-b border-border px-3 py-4 sm:px-4"
    >
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        {heading}
      </h2>
      {body}
    </section>
  );
}
