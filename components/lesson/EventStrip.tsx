"use client";

import { useEffect, useRef } from "react";
import type { EventOrigin } from "@/lib/workshop/effects";
import type { EventLine } from "@/lib/workshop/run";
import { useUi } from "@/components/i18n/LocaleContext";

interface EventStripProps {
  events: readonly EventLine[];
  /** Nombre d'événements déjà là avant cette étape : les suivants viennent d'arriver. */
  knownCount: number;
}

/** La couleur de la pastille de chaque émetteur ; son nom vient du texte de l'interface. */
const ORIGIN_CLASSES: Readonly<Record<EventOrigin, string>> = {
  agent: "bg-coral/15 text-coral-dark",
  app: "bg-[#5b8fcb]/15 text-[#2f5f95]",
  session: "bg-line text-muted",
  entry: "bg-[#e8b93b]/25 text-[#8a6a12]",
  sandbox: "bg-[#4f9fd0]/15 text-[#2f729c]",
  grader: "bg-[#a67bd6]/20 text-[#6a45a0]",
  mcp: "bg-[#12a594]/15 text-[#0c7468]",
  web: "bg-[#3e63dd]/15 text-[#2c48a8]",
};

/** Le flux d'événements de la session : ce que ton backend lit, dans l'ordre, avec qui l'a émis. */
export function EventStrip({ events, knownCount }: EventStripProps) {
  const ui = useUi();
  const listRef = useRef<HTMLOListElement>(null);
  const lastSeq = events.at(-1)?.seq ?? 0;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastSeq]);

  return (
    <section className="flex h-full max-h-60 min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel lg:max-h-none">
      <h2 className="shrink-0 px-4 pt-2.5 text-xs font-medium uppercase tracking-wide text-muted">
        {ui.events.title}
      </h2>
      {events.length === 0 ? (
        <p className="px-4 py-2 text-sm text-muted">{ui.events.empty}</p>
      ) : (
        <ol ref={listRef} className="mt-1 min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {events.map((event) => (
            <li
              key={event.seq}
              className={`flex items-baseline gap-2 rounded px-1 py-0.5 text-xs leading-snug ${event.seq > knownCount ? "bg-coral/10" : ""}`}
            >
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${ORIGIN_CLASSES[event.origin]}`}>
                {ui.events.origins[event.origin]}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink">{event.name}</span>
              <span className={`min-w-0 truncate ${event.isError ? "text-danger" : "text-muted"}`} title={event.detail}>
                {event.detail}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
