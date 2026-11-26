"use client";

import Link from "next/link";
import { useState } from "react";
import type { ArenaSettings } from "@/lib/api";
import { AgentList } from "./AgentList";
import { ActivityPanel, ChatPanel } from "./FeedPanels";
import { JoinPanel } from "./JoinPanel";
import { ModeratorPanel } from "./ModeratorPanel";
import { PixelCanvas } from "./PixelCanvas";
import { useArenaStream } from "./useArenaStream";

interface ArenaProps {
  isModeratorView: boolean;
}

const MODE_BADGES: Readonly<Record<ArenaSettings["mode"], { label: string; className: string }>> = {
  live: { label: "Sessions réelles", className: "bg-ok/15 text-ok" },
  simulation: { label: "Simulation, aucun appel à l'API", className: "bg-warn/15 text-warn" },
  unconfigured: { label: "Non configuré", className: "bg-danger/15 text-danger" },
};

/** L'arène : un canvas partagé, un agent Managed Agents par visiteur, un chat public. */
export function Arena({ isModeratorView }: ArenaProps) {
  const { view, isConnected } = useArenaStream();
  const [highlightedSlot, setHighlightedSlot] = useState<number | null>(null);

  if (!view) {
    return <p className="m-auto text-sm text-muted">Connexion à l&apos;arène…</p>;
  }

  const { world, settings } = view;
  const myAgent = world.agents.find((agent) => agent.slot === world.mySlot) ?? null;
  const activeCount = world.agents.filter((agent) => agent.status !== "retired").length;
  const badge = MODE_BADGES[settings.mode];

  return (
    <div className="flex min-h-screen flex-col gap-3 p-3 lg:h-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        <h1 className="text-lg font-semibold tracking-tight">Arène de pixels</h1>
        <p className="text-sm text-muted">
          Un agent, une session par visiteur, un seul canvas ({settings.model}).
        </p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>
        {world.isPaused && <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-xs text-warn">En pause</span>}
        {!isConnected && (
          <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-xs text-danger">Reconnexion…</span>
        )}
        <Link href={isModeratorView ? "/" : "/moderator"} className="ml-auto text-xs text-muted hover:text-text">
          {isModeratorView ? "Vue visiteur" : "Vue modérateur"}
        </Link>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-3 lg:min-h-0 lg:grid-cols-[19rem_minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3 lg:min-h-0">
          {isModeratorView && <ModeratorPanel approvals={world.approvals} isPaused={world.isPaused} />}
          <JoinPanel myAgent={myAgent} settings={settings} isFull={activeCount >= settings.maxActiveAgents} />
          <AgentList
            agents={world.agents}
            maxTurns={settings.maxTurns}
            mySlot={world.mySlot}
            onHighlight={setHighlightedSlot}
          />
        </div>

        <div className="order-first flex flex-col items-center gap-2 lg:order-none lg:min-h-0">
          <PixelCanvas world={world} highlightedSlot={highlightedSlot} />
          {!isModeratorView && world.approvals.length > 0 && (
            <p className="text-xs text-warn">
              {world.approvals.length} demande{world.approvals.length > 1 ? "s" : ""} de repeinte en attente du
              modérateur (cadre en pointillés).
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:min-h-0">
          <ChatPanel messages={world.chat} agents={world.agents} />
          <ActivityPanel activity={world.activity} />
        </div>
      </main>
    </div>
  );
}
