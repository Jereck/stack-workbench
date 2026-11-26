import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { freeEntitlements } from "@stack-workbench/shared/entitlements";
import type { Entitlements } from "@stack-workbench/shared/entitlements";

const AccessContext = createContext(freeEntitlements);

export function CompareAccess({
  access,
  children,
}: {
  access: Entitlements;
  children: ReactNode;
}) {
  return (
    <AccessContext.Provider value={access}>{children}</AccessContext.Provider>
  );
}

export function useCompareAccess() {
  return useContext(AccessContext);
}
