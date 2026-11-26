"use client";

import { useState, type FormEvent } from "react";
import type { ArenaSettings } from "@/lib/api";
import { callApi } from "@/lib/client/api";
import { LIMITS } from "@/lib/config";
import type { PublicAgent } from "@/lib/world/types";
import { formatCost, statusLabel } from "./labels";

interface JoinPanelProps {
  myAgent: PublicAgent | null;
  settings: ArenaSettings;
  isFull: boolean;
}

const FIELD_CLASS =
  "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none";

/** Le visiteur crée son agent (nom + mission), ou suit et retire celui qu'il a déjà. */
export function JoinPanel({ myAgent, settings, isFull }: JoinPanelProps) {
  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (request: () => Promise<{ success: boolean; error?: string }>): Promise<void> => {
    setIsBusy(true);
    setError(null);
    const result = await request();
    if (!result.success) setError(result.error ?? "Quelque chose a échoué.");
    setIsBusy(false);
  };

  const handleJoin = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void run(() => callApi("/api/agents", { method: "POST", body: { name, mission } }));
  };

  if (myAgent) {
    return (
      <section className="rounded-lg border border-line bg-panel p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Ton agent</h2>
        <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
          <span className="h-3 w-3 rounded-full" style={{ background: myAgent.accent }} />
          {myAgent.name}
        </p>
        <p className="mt-1 text-sm text-muted">« {myAgent.mission} »</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-xs">
          <Stat label="état" value={statusLabel(myAgent)} />
          <Stat label="tour" value={`${myAgent.turn}/${settings.maxTurns}`} />
          <Stat label="coût" value={formatCost(myAgent.costCents)} />
        </dl>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void run(() => callApi("/api/agents", { method: "DELETE" }))}
          className="mt-4 w-full rounded-md border border-line px-3 py-2 text-sm text-muted hover:border-danger hover:text-danger disabled:opacity-50"
        >
          Retirer mon agent
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Lâche ton agent</h2>
      <form onSubmit={handleJoin} className="mt-3 flex flex-col gap-3">
        <input
          className={FIELD_CLASS}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Son nom"
          maxLength={LIMITS.nameMaxLength}
          required
          aria-label="Nom de l'agent"
        />
        <textarea
          className={`${FIELD_CLASS} min-h-20 resize-none`}
          value={mission}
          onChange={(event) => setMission(event.target.value)}
          placeholder="Sa mission, en une phrase. Ex. : dessine un soleil dans un coin et défends-le."
          maxLength={LIMITS.missionMaxLength}
          required
          aria-label="Mission de l'agent"
        />
        <button
          type="submit"
          disabled={isBusy || isFull || settings.mode === "unconfigured"}
          className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg hover:brightness-110 disabled:opacity-40"
        >
          {isBusy ? "Création de la session…" : "Entrer dans l'arène"}
        </button>
      </form>
      <p className="mt-3 text-xs text-muted">
        {isFull
          ? `L'arène est pleine (${settings.maxActiveAgents} agents actifs).`
          : `${settings.maxTurns} tours au maximum, budget de ${formatCost(settings.budgetCents)} par agent.`}
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <div className="rounded-md bg-raised px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-text">{value}</dd>
    </div>
  );
}
