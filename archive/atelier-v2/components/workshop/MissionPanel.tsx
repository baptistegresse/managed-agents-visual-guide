"use client";

import { currentMission, missionProgress, MISSIONS, type Journey } from "@/lib/workshop/journey";
import type { WorkshopState } from "@/lib/workshop/state";

interface MissionPanelProps {
  workshop: WorkshopState;
  journey: Journey;
  isFreeMode: boolean;
  onToggleFreeMode: () => void;
}

/** Le parcours guidé : une mission à la fois, avec ce qu'il faut faire et ce qu'il faut remarquer. */
export function MissionPanel({ workshop, journey, isFreeMode, onToggleFreeMode }: MissionPanelProps) {
  const mission = currentMission(workshop, journey);
  const { done, total } = missionProgress(workshop, journey);
  const facts = new Set(journey.facts);
  // La mission qu'on vient de réussir reste affichée : c'est après coup qu'on lit ce qu'il fallait remarquer.
  const justDone = done > 0 ? MISSIONS[done - 1] : null;

  return (
    <section className="rounded-xl border border-coral/50 bg-coral/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-coral-dark">
          Parcours guidé · {done}/{total}
        </h2>
        <button type="button" onClick={onToggleFreeMode} className="text-[11px] text-muted underline hover:text-ink">
          {isFreeMode ? "Revenir au parcours" : "Tout afficher"}
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-coral transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      {justDone && (
        <p className="mt-3 rounded-lg bg-ok/10 px-3 py-2 text-xs leading-snug text-ink">
          <span className="font-semibold text-ok">✓ {justDone.title}. </span>
          {justDone.notice}
        </p>
      )}
      {mission ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-ink">{mission.title}</p>
          <p className="mt-1.5 text-sm leading-snug text-ink">
            <span className="font-medium text-coral-dark">À faire. </span>
            {mission.todo}
          </p>
          <p className="mt-1.5 text-xs leading-snug text-muted">
            <span className="font-medium text-ink">À remarquer. </span>
            {mission.notice}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-snug text-ink">
          Parcours terminé. Tu as vu l&apos;essentiel de Managed Agents : continue à explorer librement.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-[11px] text-muted hover:text-ink">Toutes les missions</summary>
        <ol className="mt-2 flex flex-col gap-1">
          {MISSIONS.map((each, index) => {
            const isDone = index < done || each.isDone(workshop, facts);
            return (
              <li key={each.id} className={`flex gap-2 text-xs ${each === mission ? "font-semibold text-ink" : "text-muted"}`}>
                <span className={isDone ? "text-ok" : "text-line"}>{isDone ? "✓" : "○"}</span>
                {each.title}
              </li>
            );
          })}
        </ol>
      </details>
      {isFreeMode && (
        <p className="mt-2 text-[11px] text-muted">Mode libre : toutes les options sont affichées, les missions continuent de se cocher.</p>
      )}
    </section>
  );
}
