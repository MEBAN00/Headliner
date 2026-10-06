"use client";

import { useState } from "react";
import type { LogEntry } from "./useTourRun";

/** The agent's working log. Live while running; folds away once the plan lands. */
export function CrewNotes({ log, running }: { log: LogEntry[]; running: boolean }) {
  const [open, setOpen] = useState(false);
  if (!log.length) return null;
  const expanded = running || open;
  const toolCalls = log.filter((l) => l.kind === "tool").length;

  return (
    <section aria-label="How this tour was routed" className="border-t rule pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={running}
        aria-expanded={expanded}
        className="label flex w-full items-center gap-2 text-ink-soft enabled:hover:text-ink"
      >
        {running ? <span className="live-dot" aria-hidden /> : <span aria-hidden>{expanded ? "−" : "+"}</span>}
        {running ? "Routing" : `How this was routed · ${toolCalls} data calls`}
      </button>
      <div className="reveal" data-open={expanded}>
        <div>
          <ol className="space-y-1.5 pt-3" aria-live="polite">
            {log.map((entry) => (
              <li key={entry.id} className="enter flex gap-3 text-[0.95rem] leading-snug">
                <span aria-hidden className="label w-4 shrink-0 pt-[0.2rem] text-hot">
                  {entry.kind === "tool" ? "→" : "·"}
                </span>
                <span className={entry.kind === "note" ? "italic text-ink-soft" : ""}>{entry.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
