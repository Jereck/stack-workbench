import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  rulePresets,
  validateComparisonConfiguration,
} from "@stack-workbench/comparison-engine";
import type {
  ArrayStrategy,
  ComparisonConfiguration,
  ComparisonRule,
} from "@stack-workbench/comparison-engine";
import { Button } from "@stack-workbench/ui/button";
import { controlClass } from "@stack-workbench/ui/workspace";
import { hasCapability } from "@stack-workbench/shared/entitlements";
import { canUseRule, canUseRuleKind, comparisonSettings } from "./access";
import { useCompareAccess } from "./access-context";
import { ProFeature } from "./pro-feature";

const kinds = {
  "ignore-path": "Ignore field path",
  "ignore-property": "Ignore property name",
  "ignore-xml-element": "Ignore XML element",
  "ignore-xml-attribute": "Ignore XML attribute",
  "ignore-http-header": "Ignore HTTP header",
  "ignore-query": "Ignore query parameter",
  "numeric-tolerance": "Numeric tolerance",
  "ignore-case": "Ignore case",
  "ignore-whitespace": "Ignore whitespace",
  array: "Array matching",
} satisfies Record<ComparisonRule["kind"], string>;

const arrayLabels = {
  positional: "By position",
  unordered: "Ignore order",
  keyed: "Match by identifier",
} satisfies Record<ArrayStrategy["kind"], string>;

export function describeRule(rule: ComparisonRule) {
  const scope = "path" in rule ? rule.path || "(root)" : rule.name;
  const detail =
    rule.kind === "numeric-tolerance"
      ? " ±" + rule.absolute
      : rule.kind === "array"
        ? " · " +
          arrayLabels[rule.strategy.kind] +
          (rule.strategy.kind === "keyed"
            ? " (" + rule.strategy.keys.join(", ") + ")"
            : "")
        : "";
  return kinds[rule.kind] + " · " + scope + detail;
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className="block text-label font-medium text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function Check({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked?: boolean;
}) {
  return (
    <label className="inline-flex min-h-8 items-center gap-2 text-ui text-secondary">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="size-4 shrink-0 accent-accent"
      />
      {label}
    </label>
  );
}

const splitKeys = (text: FormDataEntryValue | null) =>
  String(text ?? "")
    .split(/\r?\n/)
    .map((key) => key.trim())
    .filter(Boolean);

function arrayStrategy(
  kind: ArrayStrategy["kind"],
  keys: FormDataEntryValue | null,
): ArrayStrategy {
  return kind === "keyed" ? { kind, keys: splitKeys(keys) } : { kind };
}

function ArrayFields({ initial }: { initial?: ArrayStrategy }) {
  const [strategy, setStrategy] = useState(initial?.kind ?? "positional");
  return (
    <>
      <Labeled label="Array matching">
        <select
          name="strategy"
          value={strategy}
          className={controlClass}
          onChange={(event) =>
            setStrategy(event.target.value as ArrayStrategy["kind"])
          }
        >
          {Object.entries(arrayLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Labeled>
      {strategy === "keyed" && (
        <Labeled label="Identifier fields, one per line">
          <textarea
            name="keys"
            rows={2}
            required
            maxLength={4096}
            spellCheck={false}
            defaultValue={
              initial?.kind === "keyed" ? initial.keys.join("\n") : "id"
            }
            className={controlClass + " font-mono"}
          />
        </Labeled>
      )}
    </>
  );
}

function RuleForm({
  existing,
  newId,
  onSave,
  onClose,
}: {
  existing?: ComparisonRule;
  newId: () => string;
  onSave: (rule: ComparisonRule) => boolean;
  onClose: () => void;
}) {
  const access = useCompareAccess();
  const advanced = hasCapability(access, "compare.advanced-rules");
  const [kind, setKind] = useState<ComparisonRule["kind"]>(
    existing?.kind ?? "ignore-path",
  );
  const usesName =
    kind === "ignore-property" ||
    kind === "ignore-xml-element" ||
    kind === "ignore-xml-attribute" ||
    kind === "ignore-http-header" ||
    kind === "ignore-query";
  return (
    <form
      className="space-y-2 rounded-control border border-border bg-background p-3"
      aria-label={existing ? "Edit rule" : "New rule"}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const base = {
          id: existing?.id ?? newId(),
          enabled: existing?.enabled ?? true,
        };
        const path = String(form.get("path") ?? "");
        const rule: ComparisonRule = usesName
          ? { ...base, kind, name: String(form.get("name") ?? "") }
          : kind === "numeric-tolerance"
            ? { ...base, kind, path, absolute: Number(form.get("absolute")) }
            : kind === "array"
              ? {
                  ...base,
                  kind,
                  path,
                  strategy: arrayStrategy(
                    form.get("strategy") as ArrayStrategy["kind"],
                    form.get("keys"),
                  ),
                }
              : { ...base, kind, path };
        if (onSave(rule)) onClose();
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Labeled label="Rule type">
          <select
            name="kind"
            value={kind}
            className={controlClass}
            onChange={(event) =>
              setKind(event.target.value as ComparisonRule["kind"])
            }
          >
            {Object.entries(kinds)
              .filter(([value]) =>
                canUseRuleKind(access, value as ComparisonRule["kind"]),
              )
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </Labeled>
        {usesName ? (
          <Labeled label="Field name">
            <input
              name="name"
              className={controlClass + " font-mono"}
              required
              maxLength={2048}
              defaultValue={existing && "name" in existing ? existing.name : ""}
              autoComplete="off"
              spellCheck={false}
            />
          </Labeled>
        ) : (
          <Labeled label="Field path">
            <input
              name="path"
              className={controlClass + " font-mono"}
              maxLength={2048}
              placeholder={
                kind === "array"
                  ? "/items"
                  : advanced
                    ? "/items/*/requestId"
                    : "/items/0/requestId"
              }
              defaultValue={existing && "path" in existing ? existing.path : ""}
              autoComplete="off"
              spellCheck={false}
            />
          </Labeled>
        )}
        {kind === "numeric-tolerance" && (
          <Labeled label="Absolute tolerance">
            <input
              name="absolute"
              type="number"
              min="0"
              step="any"
              required
              className={controlClass}
              defaultValue={existing?.kind === kind ? existing.absolute : "0"}
            />
          </Labeled>
        )}
        {kind === "array" && (
          <ArrayFields
            initial={existing?.kind === kind ? existing.strategy : undefined}
          />
        )}
      </div>
      {!usesName && (
        <p className="text-label text-muted-foreground">
          {advanced ? (
            <>
              Use a JSON Pointer. <code>*</code> matches one segment,{" "}
              <code>**</code> matches any depth, and an empty path selects the
              root.
            </>
          ) : (
            <>Enter an exact JSON Pointer. An empty path selects the root.</>
          )}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit">{existing ? "Save rule" : "Add rule"}</Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel edit
        </Button>
      </div>
    </form>
  );
}

function ComparisonOptions({
  configuration,
  onApply,
}: {
  configuration: ComparisonConfiguration;
  onApply: (configuration: ComparisonConfiguration) => boolean;
}) {
  const access = useCompareAccess();
  const rules = hasCapability(access, "compare.advanced-rules");
  const arrays = hasCapability(access, "compare.array-matching");
  const schema = hasCapability(access, "compare.schema");
  if (!rules && !arrays && !schema)
    return <ProFeature capability="compare.advanced-rules" disclosure />;
  return (
    <details className="border-t border-border pt-1">
      <summary className="cursor-pointer py-2 text-ui font-medium">
        Comparison settings
      </summary>
      <form
        className="grid gap-2 pb-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onApply({
            ...configuration,
            mode: form.get("mode") === "structure" ? "structure" : "values",
            arrays: arrayStrategy(
              form.get("strategy") as ArrayStrategy["kind"],
              form.get("keys"),
            ),
            json: { decodeEscaped: form.has("escaped") },
            xml: {
              normalizeWhitespace: form.has("xml-space"),
              soapScope: form.get("soap") === "body" ? "body" : "envelope",
              identityAttributes: splitKeys(form.get("xml-keys")),
            },
            text: {
              normalizeWhitespace: form.has("text-space"),
              normalizeLineEndings: form.has("line-endings"),
            },
          });
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {schema && (
            <Labeled label="Compare">
              <select
                name="mode"
                className={controlClass}
                defaultValue={configuration.mode ?? "values"}
              >
                <option value="values">Values and types</option>
                <option value="structure">Observed structure</option>
              </select>
            </Labeled>
          )}
          {rules && (
            <Labeled label="SOAP scope">
              <select
                name="soap"
                className={controlClass}
                defaultValue={configuration.xml?.soapScope ?? "envelope"}
              >
                <option value="envelope">Entire envelope</option>
                <option value="body">Body only</option>
              </select>
            </Labeled>
          )}
          {arrays && <ArrayFields initial={configuration.arrays} />}
          {arrays && (
            <Labeled label="XML identifiers, one per line">
              <textarea
                name="xml-keys"
                rows={1}
                maxLength={4096}
                spellCheck={false}
                className={controlClass + " font-mono"}
                defaultValue={configuration.xml?.identityAttributes?.join("\n")}
                placeholder="id"
              />
            </Labeled>
          )}
        </div>
        {rules && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Check
              name="escaped"
              label="Decode escaped JSON"
              checked={configuration.json?.decodeEscaped}
            />
            <Check
              name="xml-space"
              label="Normalize XML whitespace"
              checked={configuration.xml?.normalizeWhitespace}
            />
            <Check
              name="text-space"
              label="Normalize text whitespace"
              checked={configuration.text?.normalizeWhitespace}
            />
            <Check
              name="line-endings"
              label="Normalize line endings"
              checked={configuration.text?.normalizeLineEndings !== false}
            />
          </div>
        )}
        <Button type="submit" variant="outline" className="justify-self-start">
          Apply settings
        </Button>
      </form>
    </details>
  );
}

export function RuleEditor({
  configuration,
  onChange,
  newId,
  id,
}: {
  configuration: ComparisonConfiguration;
  onChange: (configuration: ComparisonConfiguration) => void;
  newId: () => string;
  id: string;
}) {
  const access = useCompareAccess();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const rules = configuration.rules ?? [];
  function apply(next: ComparisonConfiguration) {
    if (next.rules?.some((rule) => !canUseRule(access, rule))) {
      setError("This rule requires Pro. Free supports exact paths.");
      return false;
    }
    const allowed = comparisonSettings(access, next);
    const issue = validateComparisonConfiguration(allowed);
    setError(issue ?? "");
    if (issue) return false;
    onChange(allowed);
    return true;
  }
  const update = (rules: readonly ComparisonRule[]) =>
    apply({ ...configuration, rules });
  return (
    <section
      id={id}
      aria-labelledby={id + "-title"}
      className="space-y-2 border-b border-border bg-surface px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={id + "-title"} className="mr-auto text-sm font-semibold">
          Comparison rules
        </h2>
        {hasCapability(access, "compare.advanced-rules") && (
          <select
            aria-label="Rule preset"
            className={controlClass + " w-auto! max-w-full"}
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              const preset = rulePresets[Number(event.target.value) - 1];
              if (preset)
                update([
                  ...rules,
                  ...preset.rules.filter(
                    ({ id }) => !rules.some((rule) => rule.id === id),
                  ),
                ]);
            }}
          >
            <option value="">Apply preset…</option>
            {rulePresets.map(({ name }, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>
        )}
        <Button variant="outline" onClick={() => setEditing("")}>
          <Plus size={14} aria-hidden /> New rule
        </Button>
      </div>
      {!rules.length && editing === null && (
        <p className="text-ui text-muted-foreground">
          Add a rule or ignore a path from the results.
        </p>
      )}
      {rules.length > 0 && (
        <ul aria-label="Applied rules" className="divide-y divide-border">
          {rules.map((rule, index) => (
            <li key={rule.id} className="flex min-w-0 items-center gap-2 py-1">
              <label className="flex min-h-8 min-w-0 flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-accent"
                  checked={rule.enabled}
                  aria-label={"Enable rule " + (index + 1)}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    update(
                      rules.map((item) =>
                        item.id === rule.id ? { ...item, enabled } : item,
                      ),
                    );
                  }}
                />
                <span className="min-w-0 text-ui wrap-anywhere">
                  {describeRule(rule)}
                </span>
              </label>
              <Button
                size="icon"
                variant="ghost"
                title="Edit rule"
                aria-label={"Edit rule " + (index + 1)}
                onClick={() => setEditing(rule.id)}
              >
                <Pencil size={14} aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Remove rule"
                aria-label={"Remove rule " + (index + 1)}
                onClick={() => {
                  update(rules.filter((item) => item.id !== rule.id));
                  if (editing === rule.id) setEditing(null);
                }}
              >
                <Trash2 size={14} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing !== null && (
        <RuleForm
          key={editing}
          existing={rules.find(({ id }) => id === editing)}
          newId={newId}
          onClose={() => {
            setEditing(null);
            setError("");
          }}
          onSave={(updated) =>
            update(
              editing
                ? rules.map((rule) => (rule.id === editing ? updated : rule))
                : [...rules, updated],
            )
          }
        />
      )}
      <ComparisonOptions configuration={configuration} onApply={apply} />
      {error && (
        <p role="alert" className="text-ui text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
