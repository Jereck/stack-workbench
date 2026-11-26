import { useEffect, useRef, useState } from "react";
import { validIdentifierPaths } from "@stack-workbench/comparison-engine";
import type {
  ComparisonConfiguration,
  SessionOptions,
  SessionResult,
  SessionSettings,
  SessionSide,
  Side,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import {
  controlClass,
  EmptyState,
  WorkspaceToolbar,
} from "@stack-workbench/ui/workspace";
import { InputPanel, sideNames } from "./input-panel";
import type { DraftEdit } from "./input-panel";
import { ProfileSelect } from "./profiles-panel";
import type { SavedProfile } from "./profile-storage";
import { sessionReport } from "./report";
import { ReportPanel } from "./report-panel";
import { SessionResults } from "./session-results";
import { sessionSamples } from "./session-samples";
import { useWorkspace } from "./use-workspace";
import { startSession } from "./worker-client";
import { useCompareAccess } from "./access-context";
import { hasCapability } from "@stack-workbench/shared/entitlements";
import type { CompareTransfer } from "@stack-workbench/shared/tool-handoff";
import { ProFeature } from "./pro-feature";

const sides = ["baseline", "target"] as const;
type Compared = Extract<SessionResult, { status: "compared" }>;
type Run = {
  result: SessionResult;
  options: SessionOptions;
  date: string;
  revision: number;
};

function GroupPicker({
  label,
  groups,
  value,
  onChange,
}: {
  label: string;
  groups: SessionSide["groups"];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const matches = groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) =>
      group.value.toLowerCase().includes(query.toLowerCase()),
    );
  const shown = matches.slice(0, 40);
  const selected = groups[Number(value) - 1];
  if (selected && !shown.some(({ index }) => index + 1 === Number(value)))
    shown.push({ group: selected, index: Number(value) - 1 });
  return (
    <div className="min-w-0">
      <input
        aria-label={"Search " + label.toLowerCase() + " groups"}
        type="search"
        placeholder="Find a group ID…"
        maxLength={256}
        spellCheck={false}
        autoComplete="off"
        value={query}
        className={controlClass}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select
        aria-label={label + " correlation group"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass + " mt-1"}
      >
        <option value="">Select {label.toLowerCase()} group</option>
        {shown.map(({ group, index }) => (
          <option key={index} value={index + 1}>
            {group.field +
              " · " +
              group.value.slice(0, 100) +
              " (" +
              group.count +
              " events)"}
          </option>
        ))}
      </select>
      {matches.length > 40 && (
        <p className="mt-1 text-label text-muted-foreground">
          Search to narrow {matches.length} groups.
        </p>
      )}
    </div>
  );
}

function SessionMatchingControls({
  result,
  options,
  compare,
}: {
  result: Compared;
  options: SessionOptions;
  compare: (changes: Pick<SessionOptions, "groups" | "overrides">) => void;
}) {
  const selected = (side: Side) => {
    const group = options.groups?.[side];
    const index = group
      ? result[side].groups.findIndex(
          ({ field, value }) => field === group.field && value === group.value,
        )
      : -1;
    return index < 0 ? "" : String(index + 1);
  };
  const [baselineGroup, setBaselineGroup] = useState(() =>
    selected("baseline"),
  );
  const [targetGroup, setTargetGroup] = useState(() => selected("target"));
  const [message, setMessage] = useState("");
  return (
    <div className="border-y border-border px-3 text-ui sm:px-4">
      <details className="border-b border-border py-2">
        <summary className="cursor-pointer font-semibold">
          Match correlation groups
        </summary>
        <p className="my-2 text-muted-foreground">
          Select a recorded group on each side. Identifiers can differ across
          sessions.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <GroupPicker
            label="Baseline"
            groups={result.baseline.groups}
            value={baselineGroup}
            onChange={setBaselineGroup}
          />
          <GroupPicker
            label="Target"
            groups={result.target.groups}
            value={targetGroup}
            onChange={setTargetGroup}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!baselineGroup || !targetGroup}
            onClick={() => {
              const baseline =
                result.baseline.groups[Number(baselineGroup) - 1];
              const target = result.target.groups[Number(targetGroup) - 1];
              if (baseline && target)
                compare({
                  groups: {
                    baseline: { field: baseline.field, value: baseline.value },
                    target: { field: target.field, value: target.value },
                  },
                  overrides: [],
                });
            }}
          >
            Compare selected groups
          </Button>
          {options.groups && (
            <Button
              variant="ghost"
              onClick={() => compare({ groups: undefined, overrides: [] })}
            >
              Compare full sessions
            </Button>
          )}
        </div>
      </details>
      <details className="py-2">
        <summary className="cursor-pointer font-semibold">
          Manual transaction matching
          {options.overrides?.length
            ? " (" + options.overrides.length + ")"
            : ""}
        </summary>
        <p className="my-2 text-muted-foreground">
          Use transaction numbers shown in HTTP transactions. A manual pair
          takes priority over automatic matches.
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            const pair = {
              baseline: Number(fields.get("baseline")) - 1,
              target: Number(fields.get("target")) - 1,
            };
            if (
              sides.some(
                (side) =>
                  !result[side].transactions.some(
                    ({ id }) => id === pair[side],
                  ),
              )
            ) {
              setMessage(
                "Choose an available transaction number on each side.",
              );
              return;
            }
            const kept = (options.overrides ?? []).filter(
              (entry) =>
                entry.baseline !== pair.baseline &&
                entry.target !== pair.target,
            );
            compare({ groups: options.groups, overrides: [...kept, pair] });
          }}
        >
          {sides.map((side) => (
            <label key={side} className="block min-w-24">
              {sideNames[side]} transaction number
              <input
                name={side}
                type="number"
                step={1}
                min={1}
                max={20000}
                required
                className={controlClass}
              />
            </label>
          ))}
          <Button type="submit" variant="outline">
            Apply manual match
          </Button>
        </form>
        {message && (
          <p role="alert" className="mt-2 text-danger">
            {message}
          </p>
        )}
        {options.overrides?.length ? (
          <ul className="mt-2 divide-y divide-border">
            {options.overrides.map((entry) => (
              <li
                key={entry.baseline}
                className="flex flex-wrap items-center gap-2 py-1"
              >
                <span>
                  Baseline #{entry.baseline + 1} ↔ Target #{entry.target + 1}
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    compare({
                      groups: options.groups,
                      overrides: options.overrides?.filter(
                        (item) => item !== entry,
                      ),
                    })
                  }
                >
                  Remove manual match
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  );
}

export function SessionPanel({
  matching,
  onMatching,
  comparison,
  profiles,
  incoming,
}: {
  matching: SessionSettings;
  onMatching: (settings: SessionSettings) => void;
  comparison: ComparisonConfiguration;
  profiles: SavedProfile[];
  incoming: readonly CompareTransfer[];
}) {
  const workspace = useWorkspace(incoming, "session");
  const access = useCompareAccess();
  const matchingAllowed = hasCapability(access, "compare.session-matching");
  const [profileId, setProfileId] = useState("");
  const [run, setRun] = useState<Run>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const operation = useRef<ReturnType<typeof startSession> | undefined>(
    undefined,
  );
  const revision = useRef(0);
  const drafts = workspace.drafts;
  const profile = profiles.find(({ id }) => id === profileId)?.profile;
  const effective = profile?.configuration ?? comparison;
  const result = run?.result;
  const labels = {
    baseline: drafts.baseline.label.trim() || "Baseline",
    target: drafts.target.label.trim() || "Target",
  };

  useEffect(
    () => () => {
      operation.current?.cancel();
      operation.current = undefined;
    },
    [],
  );

  function stop() {
    operation.current?.cancel();
    operation.current = undefined;
    setBusy(false);
  }
  function reset() {
    stop();
    setRun(undefined);
    setMessage("");
  }
  function compare(
    changes?: Pick<SessionOptions, "groups" | "overrides">,
    strategy = matching,
  ) {
    if (!workspace.canRun) return;
    stop();
    setBusy(true);
    setRun(undefined);
    setMessage("");
    const options = {
      comparison: effective,
      matching: strategy,
      groups: changes?.groups,
      overrides: changes?.overrides,
    };
    const job = startSession(
      {
        baseline: drafts.baseline,
        target: drafts.target,
        options,
      },
      access,
    );
    operation.current = job;
    const date = new Date().toISOString();
    const current = ++revision.current;
    void job.result.then((outcome) => {
      if (operation.current !== job) return;
      operation.current = undefined;
      setBusy(false);
      if (outcome.status === "completed")
        setRun({ result: outcome.result, options, date, revision: current });
      else if (outcome.status === "failed")
        setMessage(
          "The local session worker could not complete this comparison.",
        );
    });
  }
  function edit(side: Side, patch: DraftEdit) {
    if ("text" in patch || "format" in patch || "logFormat" in patch) reset();
    workspace.edit(side, patch);
  }

  return (
    <section aria-label="Log session workspace" className="min-w-0">
      <WorkspaceToolbar>
        <Button disabled={!workspace.canRun || busy} onClick={() => compare()}>
          Compare sessions
        </Button>
        {(busy || workspace.busy) && (
          <Button
            variant="outline"
            onClick={() => {
              stop();
              workspace.cancel();
              setMessage("Session operation cancelled.");
            }}
          >
            Cancel session
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            reset();
            workspace.replacePair(
              { text: sessionSamples.baseline, label: "DEV", format: "log" },
              { text: sessionSamples.target, label: "QA", format: "log" },
            );
          }}
        >
          Load session examples
        </Button>
        {profiles.length > 0 && (
          <ProfileSelect
            label="Session profile"
            profiles={profiles}
            value={profileId}
            onChange={(id) => {
              setProfileId(id);
              onMatching(
                profiles.find((entry) => entry.id === id)?.profile.session ??
                  {},
              );
              reset();
            }}
          />
        )}
        <Button
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            reset();
            workspace.clear();
          }}
        >
          Clear session
        </Button>
      </WorkspaceToolbar>
      {matchingAllowed && (
        <details className="border-b border-border px-3 py-2 sm:px-4">
          <summary className="cursor-pointer text-ui font-medium">
            Session matching settings
          </summary>
          <form
            key={JSON.stringify(matching)}
            className="mt-2 space-y-2 text-ui"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const list = (key: string) =>
                String(data.get(key) ?? "")
                  .split(/\r?\n/)
                  .map((entry) => entry.trim())
                  .filter(Boolean);
              const next = {
                includeService: data.has("service"),
                includeOperation: data.has("operation"),
                eventIdentifiers: list("eventIdentifiers"),
                payloadIdentifiers: list("payloadIdentifiers"),
              };
              if (
                !validIdentifierPaths(next.eventIdentifiers) ||
                !validIdentifierPaths(next.payloadIdentifiers)
              ) {
                setMessage(
                  "Use up to eight distinct exact JSON Pointers in each list.",
                );
                return;
              }
              onMatching(next);
              if (run || busy) compare(run?.options, next);
              else setMessage("Session matching settings applied.");
            }}
          >
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="service"
                  defaultChecked={matching.includeService !== false}
                />{" "}
                Match service names
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="operation"
                  defaultChecked={matching.includeOperation}
                />{" "}
                Match operation names for HTTP
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label>
                Event identifiers, one JSON Pointer per line
                <textarea
                  name="eventIdentifiers"
                  rows={2}
                  maxLength={2060}
                  defaultValue={matching.eventIdentifiers?.join("\n")}
                  placeholder="/operationId"
                  className={controlClass + " font-mono"}
                />
              </label>
              <label>
                Payload identifiers, one JSON Pointer per line
                <textarea
                  name="payloadIdentifiers"
                  rows={2}
                  maxLength={2060}
                  defaultValue={matching.payloadIdentifiers?.join("\n")}
                  placeholder="/orderId"
                  className={controlClass + " font-mono"}
                />
              </label>
            </div>
            <Button type="submit" variant="outline">
              Apply matching settings
            </Button>
          </form>
        </details>
      )}
      <div className="grid min-w-0 gap-3 bg-background p-3 lg:grid-cols-2 sm:px-4">
        {sides.map((side) => (
          <InputPanel
            key={side}
            side={side}
            title={sideNames[side] + " logs"}
            draft={{ ...drafts[side], format: "log" }}
            roomy={false}
            detected={result?.status === "compared" ? "log" : undefined}
            detectedLog={
              result?.status === "compared" ? result[side].format : undefined
            }
            notice={workspace.notices[side]}
            reading={Boolean(workspace.reading[side])}
            onEdit={(patch) => edit(side, patch)}
            onFile={(files) => {
              reset();
              workspace.openFile(side, files);
            }}
            onSample={() =>
              edit(side, { text: sessionSamples[side], format: "log" })
            }
            onClear={() => {
              reset();
              workspace.edit(side, { text: "" }, true);
            }}
            onlyLogs
          />
        ))}
      </div>
      {(busy || message) && (
        <p role="status" className="px-3 py-2 text-ui">
          {busy ? "Matching recorded sessions locally…" : message}
        </p>
      )}
      {result?.status === "failed" && (
        <p role="alert" className="px-3 py-2 text-ui text-danger">
          {result.message}
        </p>
      )}
      {!busy && !result && (
        <EmptyState title="Compare recorded sessions">
          Paste or open application logs, or load the examples to see matched
          transactions.
        </EmptyState>
      )}
      {run && result?.status === "compared" && (
        <div key={run.revision}>
          {matchingAllowed ? (
            <SessionMatchingControls
              result={result}
              options={run.options}
              compare={compare}
            />
          ) : (
            <ProFeature capability="compare.session-matching" disclosure />
          )}
          <ReportPanel
            report={() => sessionReport(result, labels, run.options, run.date)}
          />
          <SessionResults result={result} labels={labels} />
        </div>
      )}
    </section>
  );
}
