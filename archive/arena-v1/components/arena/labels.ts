import type { ActivitySource, PublicAgent, RetireReason } from "@/lib/world/types";

const RETIRE_LABELS: Readonly<Record<RetireReason, string>> = {
  turns_exhausted: "tours épuisés",
  budget_reached: "budget atteint",
  left: "retiré",
  terminated: "session terminée",
  error: "erreur",
};

export function statusLabel(agent: PublicAgent): string {
  switch (agent.status) {
    case "starting":
      return "démarre";
    case "thinking":
      return "réfléchit";
    case "resting":
      return "attend son tour";
    case "awaiting_approval":
      return "attend le modérateur";
    case "retired":
      return agent.retireReason ? RETIRE_LABELS[agent.retireReason] : "terminé";
  }
}

export function formatCost(costCents: number | null): string {
  return costCents === null ? "—" : `$${(costCents / 100).toFixed(2)}`;
}

export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export interface SourceStyle {
  readonly label: string;
  readonly color: string;
  readonly hint: string;
}

/** Où chaque étape s'exécute : c'est la frontière que la démo rend visible. */
export const SOURCE_STYLES: Readonly<Record<ActivitySource, SourceStyle>> = {
  model: { label: "Modèle", color: "#b79cff", hint: "Claude, chez Anthropic" },
  session: { label: "Session", color: "#7c9cff", hint: "cycle de vie géré par Anthropic" },
  server: { label: "Ton serveur", color: "#4fc08d", hint: "outils custom exécutés ici" },
  moderator: { label: "Modérateur", color: "#f5b84a", hint: "décision humaine" },
};
