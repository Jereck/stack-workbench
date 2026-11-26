import { useRef, useState } from "react";
import {
  inputFormats,
  MAX_PROFILE_BYTES,
  parseComparisonProfile,
  serializeComparisonProfile,
} from "@stack-workbench/comparison-engine";
import type {
  ComparisonProfile,
  InputFormat,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import {
  controlClass,
  EmptyState,
  WorkspaceToolbar,
} from "@stack-workbench/ui/workspace";
import { download } from "./download";
import { clearProfiles, removeProfile, storeProfile } from "./profile-storage";
import type { SavedProfile } from "./profile-storage";

export function ProfileSelect({
  profiles,
  value,
  onChange,
  label = "Comparison profile",
  disabled,
}: {
  profiles: readonly SavedProfile[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      disabled={disabled}
      className={controlClass + " w-auto! max-w-full"}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">No saved profile</option>
      {profiles.map(({ id, profile }) => (
        <option key={id} value={id}>
          {profile.name}
        </option>
      ))}
    </select>
  );
}

export type ProfileDefaults = Omit<
  ComparisonProfile,
  "version" | "name" | "description"
>;

export function ProfilesPanel({
  profiles,
  capture,
  apply,
}: {
  profiles: SavedProfile[];
  capture: () => ProfileDefaults;
  apply: (profile: ComparisonProfile) => void;
}) {
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const file = useRef<HTMLInputElement>(null);
  const choice = profiles.find(({ id }) => id === selected);
  const current = choice?.profile;

  function attempt(action: () => void, message: string) {
    try {
      action();
      setNotice({ text: message });
      return true;
    } catch (error) {
      setNotice({
        text:
          error instanceof Error
            ? error.message
            : "Could not update local profiles.",
        error: true,
      });
      return false;
    }
  }

  async function importFile(input: File) {
    if (input.size > MAX_PROFILE_BYTES) {
      setNotice({
        text: "Profile files must be 64 KiB or smaller.",
        error: true,
      });
      return;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        await input.arrayBuffer(),
      );
    } catch {
      setNotice({ text: "Could not read the profile as UTF-8.", error: true });
      return;
    }
    attempt(() => {
      setSelected(storeProfile(parseComparisonProfile(text)));
      setEditing(false);
    }, "Profile imported.");
  }

  return (
    <section aria-label="Saved comparison profiles" className="min-w-0">
      <WorkspaceToolbar>
        <Button
          onClick={() => {
            setSelected("");
            setEditing(true);
            setNotice(undefined);
          }}
        >
          New profile
        </Button>
        <Button variant="outline" onClick={() => file.current?.click()}>
          Import profile
        </Button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Choose profile file"
          onChange={(event) => {
            const candidate = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (candidate) void importFile(candidate);
          }}
        />
        <Button
          variant="ghost"
          disabled={!profiles.length}
          onClick={() => setConfirmClear(!confirmClear)}
        >
          Clear stored profiles
        </Button>
      </WorkspaceToolbar>
      <div className="space-y-3 px-3 py-3 text-ui sm:px-4">
        <p className="text-muted-foreground">
          Profiles store settings on this browser. Avoid entering credentials or
          real identifiers in custom rules, names or descriptions.
        </p>
        {confirmClear && (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Confirm profile removal"
          >
            <span>Remove all saved profiles from this browser?</span>
            <Button
              variant="outline"
              onClick={() => {
                if (attempt(clearProfiles, "Stored profiles cleared.")) {
                  setSelected("");
                  setEditing(false);
                  setConfirmClear(false);
                }
              }}
            >
              Remove all profiles
            </Button>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Keep profiles
            </Button>
          </div>
        )}
        {profiles.length ? (
          <div className="flex min-w-0 flex-wrap gap-2">
            <ProfileSelect
              profiles={profiles}
              value={selected}
              onChange={(id) => {
                setSelected(id);
                setEditing(false);
              }}
              label="Saved profile"
            />
            {current && (
              <>
                <Button variant="outline" onClick={() => apply(current)}>
                  Apply to payloads
                </Button>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit profile
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    attempt(() => {
                      setSelected(
                        storeProfile({
                          ...current,
                          name: current.name.slice(0, 74) + " copy",
                        }),
                      );
                      setEditing(false);
                    }, "Profile duplicated.")
                  }
                >
                  Duplicate
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    attempt(
                      () =>
                        download(
                          new Blob([serializeComparisonProfile(current)], {
                            type: "application/json",
                          }),
                          "integration-compare-profile.json",
                        ),
                      "Profile exported.",
                    )
                  }
                >
                  Export profile
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (
                      attempt(() => removeProfile(selected), "Profile deleted.")
                    ) {
                      setSelected("");
                      setEditing(false);
                    }
                  }}
                >
                  Delete profile
                </Button>
              </>
            )}
          </div>
        ) : (
          !editing && (
            <EmptyState title="No saved profiles">
              Create a profile from your current settings or import a profile.
            </EmptyState>
          )
        )}
        {current?.description && !editing && (
          <p className="wrap-anywhere whitespace-pre-wrap">
            {current.description}
          </p>
        )}
        {editing && (
          <form
            key={selected}
            className="max-w-2xl space-y-2 border-t border-border pt-3"
            aria-label="Profile settings"
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              const settings =
                !current || fields.has("replace") ? capture() : current;
              if (
                attempt(
                  () =>
                    setSelected(
                      storeProfile(
                        {
                          version: 1,
                          name: String(fields.get("name")),
                          description: String(fields.get("description")),
                          baselineFormat: fields.get("baseline") as InputFormat,
                          targetFormat: fields.get("target") as InputFormat,
                          configuration: settings.configuration,
                          session: settings.session,
                        },
                        choice?.id,
                      ),
                    ),
                  "Profile saved locally.",
                )
              )
                setEditing(false);
            }}
          >
            <label className="block">
              Profile name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={current?.name}
                autoComplete="off"
                className={controlClass}
              />
            </label>
            <label className="block">
              Description
              <textarea
                name="description"
                maxLength={500}
                rows={2}
                defaultValue={current?.description}
                className={controlClass}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["baseline", "target"] as const).map((side) => (
                <label key={side} className="block">
                  {side === "baseline"
                    ? "Preferred format for baseline"
                    : "Preferred format for target"}
                  <select
                    name={side}
                    className={controlClass}
                    defaultValue={
                      (current ?? capture())[
                        side === "baseline" ? "baselineFormat" : "targetFormat"
                      ] ?? "auto"
                    }
                  >
                    {Object.entries(inputFormats).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {current && (
              <label className="flex items-center gap-2">
                <input name="replace" type="checkbox" /> Replace rules and
                matching settings with the current workspace settings
              </label>
            )}
            <div className="flex gap-2">
              <Button type="submit">Save profile</Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel edit
              </Button>
            </div>
          </form>
        )}
        {notice && (
          <p
            role={notice.error ? "alert" : "status"}
            className={notice.error ? "text-danger" : "text-secondary"}
          >
            {notice.text}
          </p>
        )}
      </div>
    </section>
  );
}
