import { freeEntitlements } from "@stack-workbench/shared/entitlements";
import type { Entitlements } from "@stack-workbench/shared/entitlements";

/** Replace the source here when accounts can supply verified capabilities. */
export function getToolEntitlements(verified?: Entitlements): Entitlements {
  return verified ?? freeEntitlements;
}
