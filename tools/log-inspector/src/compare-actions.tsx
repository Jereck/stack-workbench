import type { CompareSide } from "@stack-workbench/shared/tool-handoff";
import { Button } from "@stack-workbench/ui/button";

export function CompareActions({
  source,
  onSelect,
  disabled,
}: {
  source: "payload" | "session";
  onSelect: (side: CompareSide) => void;
  disabled?: boolean;
}) {
  const label =
    source === "payload" ? "Compare this payload" : "Compare this log session";
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="text-label font-medium text-secondary">{label}</span>
      {(["baseline", "target"] as const).map((side) => (
        <Button
          key={side}
          variant="outline"
          className="min-h-7 px-2 py-1 text-label"
          disabled={disabled}
          onClick={() => onSelect(side)}
        >
          {side === "baseline" ? "Send as baseline" : "Send as target"}
        </Button>
      ))}
    </div>
  );
}
