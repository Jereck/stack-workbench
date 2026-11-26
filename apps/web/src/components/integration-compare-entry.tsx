"use client";

import { useEffect, useState } from "react";
import { IntegrationCompare } from "@stack-workbench/integration-compare";
import type { Entitlements } from "@stack-workbench/shared/entitlements";
import type { CompareTransfer } from "@stack-workbench/shared/tool-handoff";
import { takeCompareTransfers } from "@/lib/compare-handoff";
import { DevelopmentTier, useToolAccess } from "./tool-access";

export function IntegrationCompareEntry({
  entitlements,
}: {
  entitlements: Entitlements;
}) {
  const access = useToolAccess(entitlements);
  const [arrival, setArrival] = useState<{
    generation: number;
    items: readonly CompareTransfer[];
  }>({ generation: 0, items: [] });
  useEffect(() => {
    // Defer taking the inbox so React's development effect replay cannot consume it twice.
    const timer = window.setTimeout(() => {
      const items = takeCompareTransfers(access);
      if (items.length)
        setArrival(({ generation }) => ({ generation: generation + 1, items }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [access]);
  useEffect(() => {
    if (!arrival.items.length) return;
    // Drafts now own the transferred text. Release the route's copy of the inbox.
    const timer = window.setTimeout(
      () => setArrival(({ generation }) => ({ generation, items: [] })),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [arrival]);
  return (
    <>
      {process.env.NODE_ENV === "development" && (
        <DevelopmentTier tier={access.tier} />
      )}
      <IntegrationCompare
        key={access.tier + ":" + arrival.generation}
        access={access}
        incoming={arrival.items}
      />
    </>
  );
}
