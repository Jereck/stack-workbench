import {
  Activity,
  GitCompareArrows,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import type { ToolCategory } from "@stack-workbench/shared";

const icons = {
  inspect: ScanSearch,
  compare: GitCompareArrows,
  validate: ShieldCheck,
  monitor: Activity,
} satisfies Record<ToolCategory, typeof Activity>;

export function CategoryIcon({ category }: { category: ToolCategory }) {
  const Icon = icons[category];
  return (
    <span className="inline-grid size-8 shrink-0 place-items-center rounded-control bg-surface-muted text-secondary">
      <Icon size={16} aria-hidden />
    </span>
  );
}
