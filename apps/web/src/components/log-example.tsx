import { FileText, LockKeyhole } from "lucide-react";

const exampleEntries = [
  { time: "09:41:02", level: "INFO", message: "Worker started" },
  { time: "09:41:03", level: "INFO", message: "GET /health 200" },
  { time: "09:41:07", level: "WARN", message: "Upstream request slow" },
  { time: "09:41:08", level: "ERROR", message: "POST /events timed out" },
] as const;

const levelClasses = {
  INFO: "text-indigo-300",
  WARN: "text-amber-300",
  ERROR: "text-rose-300",
};

export function LogExample() {
  return (
    <figure className="min-w-0 overflow-hidden rounded-2xl border border-terminal-border bg-terminal text-terminal-text shadow-xl shadow-slate-950/10">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-terminal-border px-4 py-3.5 text-sm sm:px-5">
        <span className="flex items-center gap-2 font-mono">
          <FileText size={17} className="text-terminal-muted" aria-hidden />
          example.log
        </span>
        <span className="text-terminal-muted">Synthetic sample</span>
      </figcaption>
      <ul className="space-y-1 px-2 py-4 font-mono text-xs sm:px-3 sm:text-sm">
        {exampleEntries.map(({ time, level, message }) => (
          <li
            key={time}
            className="grid grid-cols-[auto_5ch_minmax(0,1fr)] gap-2 rounded-md px-2 py-2 even:bg-white/5 sm:gap-4 sm:px-3"
          >
            <span className="text-terminal-muted">{time}</span>
            <span className={levelClasses[level]}>{level}</span>
            <span className="wrap-anywhere">{message}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 border-t border-terminal-border px-4 py-3.5 text-sm text-terminal-muted sm:px-5">
        <LockKeyhole
          size={16}
          className="shrink-0 text-indigo-300"
          aria-hidden
        />
        Processes logs in your browser
      </p>
    </figure>
  );
}
