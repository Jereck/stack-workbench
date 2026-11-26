import { useMemo, useSyncExternalStore } from "react";
import {
  readComparisonProfile,
  serializeComparisonProfile,
} from "@stack-workbench/comparison-engine";
import type { ComparisonProfile } from "@stack-workbench/comparison-engine";

const key = "stack-workbench-compare-profiles-v1";
const changed = "stack-workbench-compare-profiles-change";
const maxStorageUnits = 512 * 1024;
const maxProfiles = 50;

export interface SavedProfile {
  id: string;
  profile: ComparisonProfile;
}

function snapshot() {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function subscribe(update: () => void) {
  window.addEventListener(changed, update);
  window.addEventListener("storage", update);
  return () => {
    window.removeEventListener(changed, update);
    window.removeEventListener("storage", update);
  };
}

function read(text: string): SavedProfile[] {
  if (!text || text.length > maxStorageUnits) return [];
  try {
    const rows: unknown = JSON.parse(text);
    if (!Array.isArray(rows) || rows.length > maxProfiles) return [];
    const ids = new Set<string>();
    const profiles: SavedProfile[] = [];
    for (const row of rows) {
      if (
        !row ||
        typeof row.id !== "string" ||
        !/^profile-[a-z\d-]{1,80}$/.test(row.id) ||
        ids.has(row.id)
      )
        continue;
      try {
        profiles.push({
          id: row.id,
          profile: readComparisonProfile(row.profile),
        });
        ids.add(row.id);
      } catch {
        /* A malformed entry should not hide valid profiles. */
      }
    }
    return profiles;
  } catch {
    return [];
  }
}

function update(next: SavedProfile[]) {
  if (next.length > maxProfiles)
    throw new Error("Store up to 50 comparison profiles per browser.");
  const text = JSON.stringify(next);
  if (text.length > maxStorageUnits)
    throw new Error("Profile storage is full. Remove a profile before saving.");
  try {
    if (next.length) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {
    throw new Error("Browser storage is unavailable for profiles.");
  }
  window.dispatchEvent(new Event(changed));
}

const emptySnapshot = () => "";
const unsubscribe = () => () => {};

export function useProfiles(enabled: boolean) {
  const stored = useSyncExternalStore(
    enabled ? subscribe : unsubscribe,
    enabled ? snapshot : emptySnapshot,
    emptySnapshot,
  );
  return useMemo(() => read(stored), [stored]);
}

export function storeProfile(profile: ComparisonProfile, id?: string) {
  const validated = readComparisonProfile(profile);
  serializeComparisonProfile(validated);
  const rows = read(snapshot());
  const entry = {
    id: id ?? "profile-" + crypto.randomUUID(),
    profile: validated,
  };
  update(
    id && rows.some((row) => row.id === id)
      ? rows.map((row) => (row.id === id ? entry : row))
      : [...rows, entry],
  );
  return entry.id;
}

export function removeProfile(id: string) {
  update(read(snapshot()).filter((row) => row.id !== id));
}
export function clearProfiles() {
  update([]);
}
