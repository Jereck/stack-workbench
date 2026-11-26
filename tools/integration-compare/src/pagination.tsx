import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@stack-workbench/ui/button";

export function Pagination({
  label,
  page,
  size,
  total,
  onChange,
}: {
  label: string;
  page: number;
  size: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (!total) return null;
  return (
    <div
      role="group"
      aria-label={label + " pagination"}
      className="flex flex-wrap items-center justify-end gap-1 border-t border-border px-2 py-1"
    >
      <span className="mr-1 text-label tabular-nums text-muted-foreground">
        {page * size + 1}–{Math.min(total, (page + 1) * size)} of {total}
      </span>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Previous page"
        title="Previous page"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={15} aria-hidden />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Next page"
        title="Next page"
        disabled={(page + 1) * size >= total}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={15} aria-hidden />
      </Button>
    </div>
  );
}
