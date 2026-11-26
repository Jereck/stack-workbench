import { useEffect, useRef, useState } from "react";
import {
  inputExceedsLimit,
  logInputFormats,
  MAX_INPUT_BYTES,
} from "@stack-workbench/comparison-engine";
import type {
  ComparisonConfiguration,
  ComparisonProfile,
  ComparisonResult,
  Side,
  LogFormat,
} from "@stack-workbench/comparison-engine";
import type { CompareTransfer } from "@stack-workbench/shared/tool-handoff";
import { comparisonSettings } from "./access";
import { useCompareAccess } from "./access-context";
import { inputLimitMessage } from "./input-panel";
import type { Draft, DraftEdit, InputNotice } from "./input-panel";
import { startComparison } from "./worker-client";

const sides = ["baseline", "target"] as const;
type Drafts = Record<Side, Draft>;

function emptyDraft(revision = 0): Draft {
  return { text: "", label: "", format: "auto", revision };
}

function bothEmpty(drafts: Drafts) {
  return !drafts.baseline.text && !drafts.target.text;
}

export function useWorkspace(
  incoming: readonly CompareTransfer[] = [],
  mode: CompareTransfer["kind"] = "payload",
) {
  const access = useCompareAccess();
  const [drafts, setDrafts] = useState<Drafts>(() => {
    const result: Drafts = { baseline: emptyDraft(), target: emptyDraft() };
    for (const transfer of incoming) {
      if (transfer.kind !== mode) continue;
      result[transfer.side] = {
        ...emptyDraft(),
        text: transfer.text,
        format: transfer.kind === "payload" ? transfer.format : "log",
        logFormat:
          transfer.kind === "session" &&
          Object.hasOwn(logInputFormats, transfer.logFormat)
            ? (transfer.logFormat as LogFormat)
            : undefined,
      };
    }
    return result;
  });
  const [configuration, setConfiguration] = useState<ComparisonConfiguration>(
    {},
  );
  const [notices, setNotices] = useState<Partial<Record<Side, InputNotice>>>(
    () =>
      Object.fromEntries(
        incoming
          .filter((item) => item.kind === mode)
          .map(({ side }) => [
            side,
            {
              kind: "info",
              text: "Received from Log Inspector. This input clears on refresh.",
            },
          ]),
      ),
  );
  const [reading, setReading] = useState<Partial<Record<Side, boolean>>>({});
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ComparisonResult>();
  const [comparedAt, setComparedAt] = useState("");
  const readers = useRef<Partial<Record<Side, FileReader>>>({});
  const job = useRef<ReturnType<typeof startComparison> | undefined>(undefined);
  const hasRun = useRef(false);
  const pendingRead = reading.baseline || reading.target;

  useEffect(() => {
    const pendingReaders = readers.current;
    return () => {
      for (const side of sides) pendingReaders[side]?.abort();
      job.current?.cancel();
      job.current = undefined;
    };
  }, []);

  function stopRead(side: Side) {
    const reader = readers.current[side];
    if (!reader) return;
    delete readers.current[side];
    reader.abort();
    setReading((previous) => ({ ...previous, [side]: false }));
  }

  function stopComparison() {
    job.current?.cancel();
    job.current = undefined;
    setRunning(false);
  }

  function invalidate() {
    stopComparison();
    hasRun.current = false;
    setMessage("");
    setResult(undefined);
    setComparedAt("");
  }

  function notify(side: Side, notice?: InputNotice) {
    setNotices((previous) => ({ ...previous, [side]: notice }));
  }

  function edit(side: Side, patch: DraftEdit, replace = false) {
    const affectsResult =
      patch.text !== undefined ||
      patch.format !== undefined ||
      patch.logFormat !== undefined;
    if (patch.text !== undefined && inputExceedsLimit(patch.text)) {
      notify(side, { text: inputLimitMessage, kind: "error" });
      return;
    }
    if (affectsResult) {
      stopRead(side);
      invalidate();
      notify(side);
    }
    setDrafts((previous) => ({
      ...previous,
      [side]: {
        ...previous[side],
        ...patch,
        revision: previous[side].revision + Number(replace),
      },
    }));
  }

  function openFile(side: Side, files: FileList) {
    const file = files[0];
    if (!file) return;
    stopRead(side);
    if (files.length !== 1 || file.size > MAX_INPUT_BYTES) {
      notify(side, {
        text:
          files.length !== 1
            ? "Open one local file per side."
            : inputLimitMessage,
        kind: "error",
      });
      return;
    }
    stopComparison();
    setMessage("");
    notify(side);
    const reader = new FileReader();
    readers.current[side] = reader;
    setReading((previous) => ({ ...previous, [side]: true }));
    const finish = () => {
      if (readers.current[side] !== reader) return false;
      delete readers.current[side];
      setReading((previous) => ({ ...previous, [side]: false }));
      return true;
    };
    const failed = (text: string) => {
      if (finish()) notify(side, { text, kind: "error" });
    };
    reader.onload = () => {
      if (!finish()) return;
      try {
        if (!(reader.result instanceof ArrayBuffer)) throw new Error();
        const text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(reader.result);
        edit(side, { text }, true);
        notify(side, { text: "Local file opened.", kind: "info" });
      } catch {
        notify(side, { text: "Open a valid UTF-8 text file.", kind: "error" });
      }
    };
    reader.onerror = () =>
      failed("Could not read the local file. Try opening it again.");
    try {
      reader.readAsArrayBuffer(file);
    } catch {
      failed("Could not read the local file. Try opening it again.");
    }
  }

  function run(next = configuration) {
    if (pendingRead || bothEmpty(drafts)) return;
    stopComparison();
    setResult(undefined);
    setMessage("");
    hasRun.current = true;
    const input = ({ text, format, logFormat }: Draft) => ({
      text,
      format,
      logFormat: format === "log" ? logFormat : undefined,
    });
    const active = startComparison(
      {
        baseline: input(drafts.baseline),
        target: input(drafts.target),
        configuration: { ...next, includeUnchanged: true },
      },
      access,
    );
    job.current = active;
    const date = new Date().toISOString();
    setRunning(true);
    void active.result.then((outcome) => {
      if (job.current !== active) return;
      job.current = undefined;
      setRunning(false);
      if (outcome.status === "completed") {
        setResult(outcome.result);
        setComparedAt(date);
      } else if (outcome.status === "failed")
        setMessage(
          "The local comparison worker could not run. Try comparing again.",
        );
    });
  }

  function applyConfiguration(next: ComparisonConfiguration) {
    const allowed = comparisonSettings(access, next);
    setConfiguration(allowed);
    if (pendingRead) {
      hasRun.current = false;
      setResult(undefined);
    } else if (hasRun.current) run(allowed);
  }

  function loadProfile(profile: ComparisonProfile) {
    for (const side of sides) stopRead(side);
    invalidate();
    setConfiguration(comparisonSettings(access, profile.configuration));
    setDrafts((previous) => ({
      baseline: {
        ...previous.baseline,
        format: profile.baselineFormat ?? "auto",
        logFormat: undefined,
      },
      target: {
        ...previous.target,
        format: profile.targetFormat ?? "auto",
        logFormat: undefined,
      },
    }));
  }

  function replacePair(
    baseline: Omit<Draft, "revision">,
    target: Omit<Draft, "revision">,
  ) {
    for (const side of sides) stopRead(side);
    invalidate();
    setNotices({});
    setDrafts((previous) => ({
      baseline: { ...baseline, revision: previous.baseline.revision + 1 },
      target: { ...target, revision: previous.target.revision + 1 },
    }));
  }

  function cancel() {
    for (const side of sides) stopRead(side);
    stopComparison();
    setMessage("Operation cancelled. You can compare again.");
  }

  function clear() {
    replacePair(emptyDraft(), emptyDraft());
    setConfiguration({});
    setMessage("Workspace cleared.");
  }

  return {
    drafts,
    configuration,
    notices,
    reading,
    running,
    message,
    result,
    comparedAt,
    busy: running || Boolean(pendingRead),
    canRun: !pendingRead && !bothEmpty(drafts),
    edit,
    openFile,
    run,
    applyConfiguration,
    loadProfile,
    replacePair,
    cancel,
    clear,
  };
}
