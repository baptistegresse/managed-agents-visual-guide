"use client";

import { useEffect, useRef } from "react";
import type { EventLine } from "@/lib/workshop/run";
import type { EventOrigin } from "@/lib/workshop/timeline";

interface CodePanelProps {
  code: string;
}

/** Le vrai appel au SDK qui correspond à l'étape en cours, rempli avec les choix faits. */
export function CodePanel({ code }: CodePanelProps) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-night">
      <h2 className="shrink-0 px-4 pt-3 text-xs font-medium uppercase tracking-wide text-white/50">
        Le vrai appel, côté code
      </h2>
      <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-[#f1e9dc]">
        {code}
      </pre>
    </section>
  );
}

const ORIGINS: Readonly<Record<EventOrigin, { label: string; className: string }>> = {
  agent: { label: "agent", className: "bg-coral/15 text-coral-dark" },
  app: { label: "ton app", className: "bg-ok/15 text-ok" },
  session: { label: "session", className: "bg-line text-muted" },
  entry: { label: "entrée", className: "bg-[#e8b93b]/25 text-[#8a6a12]" },
  sandbox: { label: "conteneur", className: "bg-[#4f9fd0]/15 text-[#2f729c]" },
  grader: { label: "correcteur", className: "bg-[#a67bd6]/20 text-[#6a45a0]" },
  mcp: { label: "service tiers", className: "bg-[#12a594]/15 text-[#0c7468]" },
  web: { label: "web", className: "bg-[#3e63dd]/15 text-[#2c48a8]" },
};

interface EventPanelProps {
  events: readonly EventLine[];
}

/** Le flux de la session, avec les vrais noms d'événements et qui les émet. */
export function EventPanel({ events }: EventPanelProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const lastSeq = events.at(-1)?.seq ?? 0;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastSeq]);

  return (
    <section className="flex max-h-72 min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel lg:max-h-none">
      <h2 className="shrink-0 px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted">Flux d&apos;événements</h2>
      {events.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">
          Quand la session tournera, chaque événement s&apos;affichera ici, dans l&apos;ordre.
        </p>
      ) : (
        <ol ref={listRef} className="mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          {events.map((event) => (
            <li key={event.seq} className="flex items-baseline gap-2 py-0.5 text-xs leading-snug">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${ORIGINS[event.origin].className}`}>
                {ORIGINS[event.origin].label}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink">{event.name}</span>
              <span className={`min-w-0 break-words ${event.isError ? "text-danger" : "text-muted"}`}>
                {event.detail}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
