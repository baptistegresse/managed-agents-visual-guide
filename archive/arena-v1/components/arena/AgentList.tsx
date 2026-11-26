"use client";

import type { PublicAgent } from "@/lib/world/types";
import { formatCost, statusLabel } from "./labels";

interface AgentListProps {
  agents: readonly PublicAgent[];
  maxTurns: number;
  mySlot: number | null;
  onHighlight: (slot: number | null) => void;
}

/** Tous les agents de l'arène ; survoler une ligne isole ses pixels sur le canvas. */
export function AgentList({ agents, maxTurns, mySlot, onHighlight }: AgentListProps) {
  return (
    <section className="flex max-h-80 flex-col rounded-lg border border-line bg-panel lg:max-h-none lg:min-h-0 lg:flex-1">
      <h2 className="border-b border-line px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">
        Agents ({agents.filter((agent) => agent.status !== "retired").length} actifs)
      </h2>
      {agents.length === 0 ? (
        <p className="p-4 text-sm text-muted">Personne pour l&apos;instant. Sois le premier.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {[...agents].reverse().map((agent) => (
            <li
              key={agent.slot}
              onMouseEnter={() => onHighlight(agent.slot)}
              onMouseLeave={() => onHighlight(null)}
              className={`border-b border-line/60 px-4 py-2.5 hover:bg-raised ${
                agent.status === "retired" ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: agent.accent }} />
                <span className="truncate font-medium">{agent.name}</span>
                {agent.slot === mySlot && (
                  <span className="rounded bg-accent/20 px-1.5 text-[10px] uppercase text-accent">toi</span>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted">{statusLabel(agent)}</span>
              </div>
              <p className="mt-1 truncate text-xs text-muted" title={agent.mission}>
                {agent.mission}
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                tour {agent.turn}/{maxTurns} · {agent.pixelCount} px · {formatCost(agent.costCents)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
