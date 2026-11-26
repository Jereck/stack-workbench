"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { LogInspector } from "@stack-workbench/log-inspector";
import { hasCapability } from "@stack-workbench/shared/entitlements";
import type { Entitlements } from "@stack-workbench/shared/entitlements";
import {
  clearCompareTransfers,
  initialCompareSlots,
  readCompareSlots,
  stageCompareTransfer,
  subscribeToCompareTransfers,
} from "@/lib/compare-handoff";
import { useToolAccess } from "./tool-access";

export function LogInspectorEntry({
  entitlements,
}: {
  entitlements: Entitlements;
}) {
  const router = useRouter();
  const access = useToolAccess(entitlements);
  const staged = useSyncExternalStore(
    subscribeToCompareTransfers,
    readCompareSlots,
    initialCompareSlots,
  );
  return (
    <LogInspector
      handoff={{
        stage: (item) => stageCompareTransfer(item, access),
        staged,
        clear: clearCompareTransfers,
        open: () => router.push("/tools/integration-compare"),
        canStageSession: hasCapability(access, "compare.sessions"),
      }}
    />
  );
}
