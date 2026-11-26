import { useEffect, useRef, useState } from "react";
import {
  inputFormats,
  MAX_INPUT_BYTES,
} from "@stack-workbench/comparison-engine";
import type {
  ComparisonConfiguration,
  InputFormat,
  Side,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import {
  controlClass,
  EmptyState,
  WorkspaceToolbar,
} from "@stack-workbench/ui/workspace";
import { ProfileSelect } from "./profiles-panel";
import type { SavedProfile } from "./profile-storage";
import { ComparisonResults } from "./results";
import type { Compared } from "./result-model";
import { samples } from "./samples";
import type { ComparisonRequest, PairSummary } from "./worker";
import { startBatchPair, startComparison } from "./worker-client";
import { useCompareAccess } from "./access-context";
import { canUseFormat } from "./access";

const maxBytes = 32 * 1024 * 1024;
const maxPairs = 128;
const sides = ["baseline", "target"] as const;
const encoder = new TextEncoder();
type BatchInput = { text: string; bytes: number; format?: InputFormat };
interface BatchPair {
  id: number;
  label: string;
  baseline: BatchInput;
  target: BatchInput;
}
interface BatchOutcome {
  summary: PairSummary;
  request: ComparisonRequest;
  date: string;
}
interface Inspection {
  id: number;
  result: Compared;
  settings: ComparisonConfiguration;
  date: string;
}
const blank = (id: number): BatchPair => ({
  id,
  label: "",
  baseline: { text: "", bytes: 0 },
  target: { text: "", bytes: 0 },
});
const totalBytes = (items: readonly BatchPair[]) =>
  items.reduce((sum, pair) => sum + pair.baseline.bytes + pair.target.bytes, 0);

export function BatchPanel({
  profiles,
  comparison,
}: {
  profiles: SavedProfile[];
  comparison: ComparisonConfiguration;
}) {
  const access = useCompareAccess();
  const [pairs, setPairs] = useState<BatchPair[]>([blank(1)]);
  const [selected, setSelected] = useState(1);
  const [profileId, setProfileId] = useState("");
  const [outcomes, setOutcomes] = useState<Record<number, BatchOutcome>>({});
  const [isBatch, setIsBatch] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspection, setInspection] = useState<Inspection>();
  const [showIgnored, setShowIgnored] = useState(false);
  const [message, setMessage] = useState("");
  const nextId = useRef(1);
  const operation = useRef<{ cancel: () => void } | undefined>(undefined);
  const batch = useRef<symbol | undefined>(undefined);
  const pair = pairs.find(({ id }) => id === selected);
  const profile = profiles.find(({ id }) => id === profileId)?.profile;
  const busy = isBatch || inspecting;
  const done = Object.values(outcomes);

  useEffect(
    () => () => {
      operation.current?.cancel();
      operation.current = undefined;
      batch.current = undefined;
    },
    [],
  );

  function stop() {
    batch.current = undefined;
    operation.current?.cancel();
    operation.current = undefined;
    setIsBatch(false);
    setInspecting(false);
  }
  function forget(id: number) {
    setOutcomes((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    if (inspection?.id === id) setInspection(undefined);
  }
  function changeInput(side: Side, changes: Partial<BatchInput>) {
    if (!pair || busy) return;
    const input = { ...pair[side], ...changes };
    if (changes.text !== undefined) {
      const bytes =
        changes.text.length > MAX_INPUT_BYTES
          ? MAX_INPUT_BYTES + 1
          : encoder.encode(changes.text).length;
      if (
        bytes > MAX_INPUT_BYTES ||
        totalBytes(pairs) - pair[side].bytes + bytes > maxBytes
      ) {
        setMessage(
          bytes > MAX_INPUT_BYTES
            ? "Use up to 4 MiB of UTF-8 text per input."
            : "This batch exceeds 32 MiB of input. Remove or shorten a pair.",
        );
        return;
      }
      input.bytes = bytes;
    }
    setPairs(
      pairs.map((item) =>
        item.id === pair.id ? { ...item, [side]: input } : item,
      ),
    );
    forget(pair.id);
    setMessage("");
  }
  function add() {
    const id = ++nextId.current;
    setPairs([...pairs, blank(id)]);
    setSelected(id);
    setInspection(undefined);
  }
  function requestFor(pair: BatchPair): ComparisonRequest {
    return {
      baseline: {
        text: pair.baseline.text,
        format: pair.baseline.format ?? profile?.baselineFormat,
      },
      target: {
        text: pair.target.text,
        format: pair.target.format ?? profile?.targetFormat,
      },
      configuration: profile?.configuration ?? comparison,
    };
  }
  async function runAll() {
    if (!pairs.length || busy) return;
    const token = Symbol();
    batch.current = token;
    setIsBatch(true);
    setOutcomes({});
    setInspection(undefined);
    setMessage("Comparing pairs locally…");
    const date = new Date().toISOString();
    for (const item of pairs) {
      if (batch.current !== token) return;
      const request = requestFor(item);
      let summary: PairSummary;
      if (!request.baseline.text && !request.target.text)
        summary = {
          status: "failed",
          differences: 0,
          message: "Enter text on either side.",
        };
      else {
        const job = startBatchPair(request, access);
        operation.current = job;
        const outcome = await job.result;
        if (batch.current !== token) return;
        summary =
          outcome.status === "completed"
            ? outcome.result
            : {
                status: "failed",
                differences: 0,
                message:
                  "The local comparison worker could not finish this pair.",
              };
      }
      setOutcomes((previous) => ({
        ...previous,
        [item.id]: { summary, request, date },
      }));
    }
    batch.current = undefined;
    operation.current = undefined;
    setIsBatch(false);
    setMessage("Batch comparison finished.");
  }
  function inspect(id: number) {
    const outcome = outcomes[id];
    if (!outcome || outcome.summary.status === "failed" || busy) return;
    setSelected(id);
    setInspection(undefined);
    setInspecting(true);
    setMessage("Loading pair evidence locally…");
    const settings = outcome.request.configuration ?? {};
    const job = startComparison(
      {
        ...outcome.request,
        configuration: { ...settings, includeUnchanged: true },
      },
      access,
    );
    operation.current = job;
    void job.result.then((reply) => {
      if (operation.current !== job) return;
      operation.current = undefined;
      setInspecting(false);
      if (reply.status === "completed" && reply.result.status === "compared") {
        setInspection({
          id,
          result: reply.result,
          settings,
          date: outcome.date,
        });
        setMessage("");
      } else setMessage("Could not open the pair evidence.");
    });
  }
  const label = (item: BatchPair) => item.label.trim() || "Pair " + item.id;
  return (
    <section aria-label="Batch comparison workspace" className="min-w-0">
      <WorkspaceToolbar>
        <Button onClick={() => void runAll()} disabled={busy || !pairs.length}>
          Run all pairs
        </Button>
        {busy && (
          <Button
            variant="outline"
            onClick={() => {
              stop();
              setMessage(
                "Batch operation cancelled. Completed pairs remain available.",
              );
            }}
          >
            Cancel batch
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy || pairs.length >= maxPairs}
          onClick={add}
        >
          Add pair
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            const next = [samples[0], samples[3]].map((sample) => ({
              id: ++nextId.current,
              label: sample.name,
              baseline: {
                text: sample.baseline,
                bytes: encoder.encode(sample.baseline).length,
              },
              target: {
                text: sample.target,
                bytes: encoder.encode(sample.target).length,
              },
            }));
            setPairs(next);
            setSelected(next[0]!.id);
            setOutcomes({});
            setInspection(undefined);
            setMessage("");
          }}
        >
          Load batch examples
        </Button>
        {profiles.length > 0 && (
          <ProfileSelect
            profiles={profiles}
            label="Batch profile"
            disabled={busy}
            value={profileId}
            onChange={(id) => {
              if (busy) return;
              setProfileId(id);
              setOutcomes({});
              setInspection(undefined);
            }}
          />
        )}
        <Button
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            stop();
            setPairs([blank(1)]);
            nextId.current = 1;
            setSelected(1);
            setOutcomes({});
            setInspection(undefined);
            setMessage("Batch cleared.");
          }}
        >
          Clear batch
        </Button>
      </WorkspaceToolbar>
      <p className="px-3 py-2 text-label text-muted-foreground">
        {pairs.length} / {maxPairs} pairs ·{" "}
        {(totalBytes(pairs) / 1024 / 1024).toFixed(2)} / 32 MiB input
      </p>
      {pair && (
        <fieldset
          disabled={busy}
          key={pair.id}
          className="min-w-0 space-y-2 border-y border-border bg-background p-3"
        >
          <legend className="sr-only">Edit selected comparison pair</legend>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <label className="min-w-32 text-ui">
              Selected pair
              <select
                className={controlClass}
                value={selected}
                onChange={(event) => {
                  setSelected(Number(event.target.value));
                  setInspection(undefined);
                }}
              >
                {pairs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-40 flex-1 text-ui">
              Pair label
              <input
                value={pair.label}
                className={controlClass}
                maxLength={80}
                autoComplete="off"
                onChange={(event) => {
                  const label = event.target.value;
                  setPairs(
                    pairs.map((item) =>
                      item.id === pair.id ? { ...item, label } : item,
                    ),
                  );
                }}
              />
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                const remaining = pairs.filter(({ id }) => id !== pair.id);
                setPairs(remaining);
                setSelected(remaining[0]?.id ?? 0);
                forget(pair.id);
              }}
            >
              Remove pair
            </Button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {sides.map((side) => (
              <div key={side} className="min-w-0 space-y-1">
                <label className="block text-ui capitalize">
                  {side}
                  <textarea
                    aria-label={"Pair " + side + " input"}
                    value={pair[side].text}
                    rows={5}
                    onChange={(event) =>
                      changeInput(side, { text: event.target.value })
                    }
                    className={controlClass + " resize-y font-mono normal-case"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <select
                  aria-label={"Batch format for " + side}
                  className={controlClass}
                  value={pair[side].format ?? ""}
                  onChange={(event) =>
                    changeInput(side, {
                      format: (event.target.value || undefined) as
                        InputFormat | undefined,
                    })
                  }
                >
                  <option value="">Use profile format or detect</option>
                  {Object.entries(inputFormats).map(([value, title]) => {
                    const allowed = canUseFormat(access, value as InputFormat);
                    return (
                      <option key={value} value={value} disabled={!allowed}>
                        {title}
                        {!allowed && " · Pro"}
                      </option>
                    );
                  })}
                </select>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      {message && (
        <p role="status" className="px-3 py-2 text-ui">
          {message}
        </p>
      )}
      {!pairs.length && (
        <EmptyState title="No pairs">
          Add a pair or load examples to start a batch.
        </EmptyState>
      )}
      {pairs.length > 0 && (
        <div className="min-w-0 border-b border-border">
          <p className="px-3 py-2 text-ui font-medium">
            {done.length} / {pairs.length} completed ·{" "}
            {done.filter(({ summary }) => summary.status === "changed").length}{" "}
            changed ·{" "}
            {done.filter(({ summary }) => summary.status === "failed").length}{" "}
            failed
          </p>
          <div
            role="region"
            aria-label="Scrollable batch outcomes"
            tabIndex={0}
            className="max-h-72 overflow-auto"
          >
            <table
              aria-label="Batch outcomes"
              className="w-full min-w-[24rem] text-left text-ui"
            >
              <thead className="sticky top-0 bg-sidebar">
                <tr>
                  <th scope="col" className="p-2">
                    Pair
                  </th>
                  <th scope="col" className="p-2">
                    Result
                  </th>
                  <th scope="col" className="p-2">
                    Differences
                  </th>
                  <th scope="col" className="p-2">
                    Evidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((item) => {
                  const result = outcomes[item.id]?.summary;
                  return (
                    <tr key={item.id} className="border-b border-border">
                      <th scope="row" className="p-2 wrap-anywhere">
                        {label(item)}
                      </th>
                      <td className="p-2 capitalize">
                        {result?.status ?? "Pending"}
                        {result?.message && (
                          <p className="text-label font-normal text-danger normal-case">
                            {result.message}
                          </p>
                        )}
                      </td>
                      <td className="p-2 font-mono">
                        {result && result.status !== "failed"
                          ? result.differences
                          : "—"}
                      </td>
                      <td className="p-2">
                        {result && result.status !== "failed" && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => inspect(item.id)}
                          >
                            Inspect {label(item)}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {inspection && pair?.id === inspection.id && (
        <ComparisonResults
          result={inspection.result}
          configuration={inspection.settings}
          date={inspection.date}
          labels={{
            baseline: label(pair) + " baseline",
            target: label(pair) + " target",
          }}
          showIgnored={showIgnored}
          setShowIgnored={setShowIgnored}
        />
      )}
    </section>
  );
}
