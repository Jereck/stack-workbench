export const compareCapabilities = [
  "compare.advanced-rules",
  "compare.array-matching",
  "compare.http",
  "compare.sessions",
  "compare.session-matching",
  "compare.batch",
  "compare.profiles",
  "compare.schema",
  "compare.reporting",
] as const;

export type Capability = (typeof compareCapabilities)[number];
export type Tier = "free" | "pro";

/** A resolved access snapshot. In production the app supplies this from its server boundary. */
export interface Entitlements {
  readonly tier: Tier;
  readonly capabilities: readonly Capability[];
}

export const freeEntitlements: Entitlements = {
  tier: "free",
  capabilities: [],
};
export const proEntitlements: Entitlements = {
  tier: "pro",
  capabilities: compareCapabilities,
};

export function hasCapability(access: Entitlements, capability: Capability) {
  return access.capabilities.includes(capability);
}
