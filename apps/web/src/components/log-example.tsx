import { FileText } from "lucide-react";
import { getLogPreview } from "@stack-workbench/log-inspector/preview";

export function LogExample() {
  const { events, payloads, exceptions } = getLogPreview();
  return (
    <figure className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-sidebar px-3 py-2.5 text-ui">
        <span className="flex items-center gap-2 font-medium">
          <FileText size={15} className="text-accent" aria-hidden />
          Log Inspector
        </span>
        <span className="font-mono text-label text-muted-foreground">
          orders.ndjson
        </span>
      </figcaption>
      <table className="w-full table-fixed text-left">
        <thead className="border-b border-border bg-background text-label text-muted-foreground">
          <tr>
            <th scope="col" className="w-[15ch] px-3 py-2 font-medium">
              Time (UTC)
            </th>
            <th scope="col" className="w-[8ch] px-2 py-2 font-medium">
              Level
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              Message
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border font-mono text-label">
          {events.map(({ index, time, level, message }) => (
            <tr
              key={index}
              className={level === "error" ? "bg-accent-soft" : undefined}
            >
              <td className="px-3 py-2.5 align-top text-muted-foreground">
                {time}
              </td>
              <td className="px-2 py-2.5 align-top">
                <span
                  className={
                    level === "error"
                      ? "text-danger"
                      : level === "warn"
                        ? "text-warning"
                        : "text-secondary"
                  }
                >
                  {level.toUpperCase()}
                </span>
              </td>
              <td className="px-2 py-2.5 break-words">{message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-3 py-2.5 text-label text-muted-foreground">
        <span>
          {events.length} events · {payloads} payloads · {exceptions} exception
        </span>
        <span>Synthetic sample</span>
      </p>
    </figure>
  );
}
