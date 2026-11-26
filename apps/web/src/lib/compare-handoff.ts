"use client";

import { hasCapability } from "@stack-workbench/shared/entitlements";
import type { Entitlements } from "@stack-workbench/shared/entitlements";
import type {
  CompareSlot,
  CompareTransfer,
} from "@stack-workbench/shared/tool-handoff";

const pending = new Map<string, CompareTransfer>();
const maximumBytes = 4 * 1024 * 1024;
const emptySlots: readonly CompareSlot[] = [];
let stagedSlots = emptySlots;
const listeners = new Set<() => void>();

export function subscribeToCompareTransfers(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function readCompareSlots() {
  return stagedSlots;
}

export function initialCompareSlots() {
  return emptySlots;
}

function updateSlots() {
  stagedSlots = Array.from(pending.values(), ({ kind, side }) => ({
    kind,
    side,
  }));
  for (const notify of listeners) notify();
}

export function stageCompareTransfer(
  transfer: CompareTransfer,
  access: Entitlements,
) {
  if (
    (transfer.kind === "session" &&
      !hasCapability(access, "compare.sessions")) ||
    !transfer.text.trim() ||
    transfer.text.length > maximumBytes ||
    new TextEncoder().encode(transfer.text).byteLength > maximumBytes
  )
    return false;
  pending.set(transfer.kind + ":" + transfer.side, transfer);
  updateSlots();
  return true;
}

export function clearCompareTransfers() {
  if (!pending.size) return;
  pending.clear();
  updateSlots();
}

export function takeCompareTransfers(access: Entitlements) {
  const copy = [...pending.values()].filter(
    ({ kind }) =>
      kind !== "session" || hasCapability(access, "compare.sessions"),
  );
  clearCompareTransfers();
  return copy;
}
