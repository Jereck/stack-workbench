"use client";

import { useSyncExternalStore } from "react";
import {
  freeEntitlements,
  proEntitlements,
} from "@stack-workbench/shared/entitlements";
import type { Entitlements, Tier } from "@stack-workbench/shared/entitlements";
import { controlClass, WorkspaceToolbar } from "@stack-workbench/ui/workspace";

let simulated: Tier = "free";
const listeners = new Set<() => void>();
function subscribe(notify: () => void) {
  if (process.env.NODE_ENV !== "development") return () => {};
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}
function snapshot(): Tier {
  return process.env.NODE_ENV === "development" ? simulated : "free";
}
function initial(): Tier {
  return "free";
}

export function useToolAccess(verified: Entitlements) {
  const tier = useSyncExternalStore(subscribe, snapshot, initial);
  return process.env.NODE_ENV === "development"
    ? tier === "pro"
      ? proEntitlements
      : freeEntitlements
    : verified;
}

export function DevelopmentTier({ tier }: { tier: Tier }) {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <WorkspaceToolbar className="bg-sidebar">
      <label className="flex flex-wrap items-center gap-2 text-ui font-medium">
        Development tier
        <select
          aria-label="Development tier"
          className={controlClass + " w-auto!"}
          value={tier}
          onChange={(event) => {
            simulated = event.target.value === "pro" ? "pro" : "free";
            for (const notify of listeners) notify();
          }}
        >
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
      </label>
      <span className="text-label text-muted-foreground">
        Changing the simulation resets the open comparison workspace.
      </span>
    </WorkspaceToolbar>
  );
}
