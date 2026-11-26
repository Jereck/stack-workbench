import {
  ArrowLeftRight,
  GitCompareArrows,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import {
  formatFieldPath,
  validateComparisonConfiguration,
} from "@stack-workbench/comparison-engine";
import type {
  ComparisonResult,
  FieldPath,
  Side,
  SessionSettings,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import {
  EmptyState,
  KeyHint,
  WorkspaceToolbar,
  viewButtonClass,
} from "@stack-workbench/ui/workspace";
import { BatchPanel } from "./batch-panel";
import { InputPanel, sideNames } from "./input-panel";
import { ComparisonResults } from "./results";
import { RuleEditor } from "./rule-editor";
import { ProfilesPanel } from "./profiles-panel";
import { useProfiles } from "./profile-storage";
import { SessionPanel } from "./session-panel";
import { samples } from "./samples";
import { useWorkspace } from "./use-workspace";
import { hasCapability } from "@stack-workbench/shared/entitlements";
import type {
  Capability,
  Entitlements,
} from "@stack-workbench/shared/entitlements";
import type { CompareTransfer } from "@stack-workbench/shared/tool-handoff";
import { CompareAccess, useCompareAccess } from "./access-context";
import { ProFeature } from "./pro-feature";

const sides = ["baseline", "target"] as const;

function FailedResult({
  result,
}: {
  result: Extract<ComparisonResult, { status: "failed" }>;
}) {
  return (
    <div
      role="alert"
      className="border-y border-border bg-danger-soft px-3 py-3 text-ui text-danger sm:px-4"
    >
      <p className="font-semibold">Comparison could not finish</p>
      <ul className="mt-1 space-y-1">
        {result.errors.map(
          ({ side, message, location, restrictedFormat }, index) => (
            <li key={index}>
              {side && sideNames[side] + " · "}
              {location && "Line " + location.line + " · "}
              {restrictedFormat === "http"
                ? "HTTP transaction comparison is a Pro feature. Choose Plain text to compare the capture line by line."
                : restrictedFormat === "log"
                  ? "Application log comparison is a Pro feature. You can inspect logs in Log Inspector or select JSON or Plain text for a payload comparison."
                  : message}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function PayloadWorkspace({
  workspace,
  onClear,
}: {
  workspace: ReturnType<typeof useWorkspace>;
  onClear: () => void;
}) {
  const { configuration, drafts, result } = workspace;
  const [roomy, setRoomy] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showIgnored, setShowIgnored] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const rulesId = useId();
  const ruleNumber = useRef(0);
  const compareButton = useRef<HTMLButtonElement>(null);
  const rulesButton = useRef<HTMLButtonElement>(null);
  const labels = {
    baseline: drafts.baseline.label.trim() || sideNames.baseline,
    target: drafts.target.label.trim() || sideNames.target,
  };
  const activeRules =
    configuration.rules?.filter(({ enabled }) => enabled).length ?? 0;
  const newRuleId = () => {
    let id: string;
    do {
      id = "rule-" + ++ruleNumber.current;
    } while (configuration.rules?.some((rule) => rule.id === id));
    return id;
  };

  function ignore(path: FieldPath) {
    const pointer = formatFieldPath(path);
    const rules = configuration.rules ?? [];
    const existing = rules.find(
      (rule) => rule.kind === "ignore-path" && rule.path === pointer,
    );
    const next = {
      ...configuration,
      rules: existing
        ? rules.map((rule) =>
            rule.id === existing.id ? { ...rule, enabled: true } : rule,
          )
        : [
            ...rules,
            {
              kind: "ignore-path" as const,
              id: newRuleId(),
              path: pointer,
              enabled: true,
            },
          ],
    };
    const error = validateComparisonConfiguration(next);
    setRuleError(error ?? "");
    if (!error) {
      setShowIgnored(true);
      workspace.applyConfiguration(next);
      rulesButton.current?.focus();
    }
  }

  function sample(side: Side, index: number) {
    const example = samples[index];
    if (example)
      workspace.edit(side, { text: example[side], format: "auto" }, true);
  }

  return (
    <section
      aria-label="Integration Compare workspace"
      className="min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          if (workspace.canRun && !workspace.running) workspace.run();
        }
      }}
    >
      <WorkspaceToolbar className="sm:px-4">
        <Button
          ref={compareButton}
          onClick={() => workspace.run()}
          disabled={!workspace.canRun || workspace.running}
          aria-keyshortcuts="Control+Enter Meta+Enter"
        >
          <GitCompareArrows size={15} aria-hidden /> Compare
        </Button>
        {workspace.busy && (
          <Button
            variant="outline"
            onClick={() => {
              workspace.cancel();
              requestAnimationFrame(() => compareButton.current?.focus());
            }}
          >
            Cancel
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => workspace.replacePair(drafts.target, drafts.baseline)}
          disabled={
            !drafts.baseline.text &&
            !drafts.target.text &&
            !drafts.baseline.label &&
            !drafts.target.label &&
            drafts.baseline.format === "auto" &&
            drafts.target.format === "auto"
          }
        >
          <ArrowLeftRight size={14} aria-hidden /> Swap inputs
        </Button>
        <Button
          ref={rulesButton}
          variant="ghost"
          onClick={() => {
            setShowRules(!showRules);
            setRuleError("");
          }}
          aria-expanded={showRules}
          aria-controls={showRules ? rulesId : undefined}
        >
          <SlidersHorizontal size={15} aria-hidden /> Rules
          {activeRules ? " (" + activeRules + ")" : ""}
        </Button>
        <span className="hidden text-label text-muted-foreground lg:inline">
          <KeyHint>Ctrl/⌘ Enter</KeyHint>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            onClick={() =>
              workspace.replacePair(
                { text: samples[0].baseline, label: "", format: "auto" },
                { text: samples[0].target, label: "", format: "auto" },
              )
            }
          >
            Load sample pair
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={roomy ? "Shrink inputs" : "Expand inputs"}
            title={roomy ? "Shrink inputs" : "Expand inputs"}
            aria-pressed={roomy}
            onClick={() => setRoomy(!roomy)}
          >
            {roomy ? (
              <Minimize2 size={15} aria-hidden />
            ) : (
              <Maximize2 size={15} aria-hidden />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Clear workspace"
            title="Clear workspace"
            onClick={() => {
              workspace.clear();
              onClear();
              setShowRules(false);
              setShowIgnored(false);
              setRuleError("");
            }}
          >
            <RotateCcw size={15} aria-hidden />
          </Button>
        </div>
      </WorkspaceToolbar>
      {showRules && (
        <RuleEditor
          id={rulesId}
          configuration={configuration}
          newId={newRuleId}
          onChange={workspace.applyConfiguration}
        />
      )}
      <div className="grid min-w-0 gap-3 bg-background p-3 lg:grid-cols-2 sm:px-4">
        {sides.map((side) => {
          const data = result?.[side]?.data;
          return (
            <InputPanel
              key={side}
              side={side}
              draft={drafts[side]}
              roomy={roomy}
              detected={data?.kind}
              detectedLog={data?.kind === "log" ? data.logs.format : undefined}
              notice={workspace.notices[side]}
              reading={Boolean(workspace.reading[side])}
              onEdit={(patch) => workspace.edit(side, patch)}
              onFile={(files) => workspace.openFile(side, files)}
              onSample={(index) => sample(side, index)}
              onClear={() => workspace.edit(side, { text: "" }, true)}
            />
          );
        })}
      </div>
      {ruleError && (
        <p
          role="alert"
          className="border-y border-border px-3 py-2 text-ui text-danger"
        >
          {ruleError}
        </p>
      )}
      <div
        role="status"
        className={
          workspace.running || workspace.message
            ? "border-t border-border px-3 py-2 text-ui text-secondary sm:px-4"
            : "sr-only"
        }
      >
        {workspace.running ? "Comparing locally…" : workspace.message}
      </div>
      {result?.status === "failed" ? (
        <FailedResult result={result} />
      ) : result?.status === "compared" ? (
        <ComparisonResults
          result={result}
          configuration={configuration}
          date={workspace.comparedAt}
          labels={labels}
          showIgnored={showIgnored}
          setShowIgnored={setShowIgnored}
          onIgnore={ignore}
        />
      ) : (
        !workspace.running && (
          <div className="border-t border-border">
            <EmptyState title="Compare two inputs">
              Paste text, open local files, or load a sample pair to see what
              changed.
            </EmptyState>
          </div>
        )
      )}
    </section>
  );
}

type Workflow = "payload" | "session" | "batch" | "profiles";
const workflows: readonly {
  key: Workflow;
  label: string;
  capability?: Capability;
}[] = [
  { key: "payload", label: "Payloads" },
  { key: "session", label: "Log sessions", capability: "compare.sessions" },
  { key: "batch", label: "Batch", capability: "compare.batch" },
  { key: "profiles", label: "Profiles", capability: "compare.profiles" },
];

function CompareWorkbench({
  incoming,
}: {
  incoming: readonly CompareTransfer[];
}) {
  const access = useCompareAccess();
  const workspace = useWorkspace(incoming);
  const sessionsAllowed = hasCapability(access, "compare.sessions");
  const profilesAllowed = hasCapability(access, "compare.profiles");
  const profiles = useProfiles(profilesAllowed);
  const [matching, setMatching] = useState<SessionSettings>({});
  const [workflow, setWorkflow] = useState<Workflow>(() =>
    sessionsAllowed &&
    incoming.length &&
    incoming.every(({ kind }) => kind === "session")
      ? "session"
      : "payload",
  );
  const [advancedRevision, setAdvancedRevision] = useState(0);
  const feature = workflows.find(({ key }) => key === workflow)?.capability;
  return (
    <div className="min-w-0">
      <div
        role="group"
        aria-label="Comparison workflow"
        className="flex flex-wrap gap-x-1 border-b border-border bg-surface px-3 pt-1 sm:px-4"
      >
        {workflows.map(({ key, label, capability }) => (
          <button
            key={key}
            type="button"
            aria-pressed={workflow === key}
            aria-label={label}
            className={viewButtonClass}
            onClick={() => setWorkflow(key)}
          >
            {label}
            {capability && !hasCapability(access, capability) && (
              <span className="ml-1.5 text-label text-muted-foreground">
                Pro
              </span>
            )}
          </button>
        ))}
      </div>
      <div hidden={workflow !== "payload"}>
        <PayloadWorkspace
          workspace={workspace}
          onClear={() => {
            setMatching({});
            setAdvancedRevision((revision) => revision + 1);
          }}
        />
      </div>
      {feature && !hasCapability(access, feature) && (
        <ProFeature capability={feature} />
      )}
      {sessionsAllowed && (
        <div hidden={workflow !== "session"}>
          <SessionPanel
            key={advancedRevision}
            matching={matching}
            onMatching={setMatching}
            comparison={workspace.configuration}
            profiles={profiles}
            incoming={advancedRevision === 0 ? incoming : []}
          />
        </div>
      )}
      {hasCapability(access, "compare.batch") && (
        <div hidden={workflow !== "batch"}>
          <BatchPanel
            key={advancedRevision}
            comparison={workspace.configuration}
            profiles={profiles}
          />
        </div>
      )}
      {profilesAllowed && (
        <div hidden={workflow !== "profiles"}>
          <ProfilesPanel
            profiles={profiles}
            capture={() => ({
              configuration: workspace.configuration,
              session: matching,
              baselineFormat: workspace.drafts.baseline.format,
              targetFormat: workspace.drafts.target.format,
            })}
            apply={(profile) => {
              workspace.loadProfile(profile);
              setWorkflow("payload");
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLButtonElement>(
                    '[aria-label="Comparison workflow"] button',
                  )
                  ?.focus(),
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

export function IntegrationCompare({
  access,
  incoming = [],
}: {
  access: Entitlements;
  incoming?: readonly CompareTransfer[];
}) {
  return (
    <CompareAccess access={access}>
      <CompareWorkbench incoming={incoming} />
    </CompareAccess>
  );
}
