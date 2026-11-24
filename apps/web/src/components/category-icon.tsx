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
    <span className="inline-grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
      <Icon size={19} aria-hidden />
    </span>
  );
}
