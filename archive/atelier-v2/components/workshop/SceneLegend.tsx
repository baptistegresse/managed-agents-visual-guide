const STEPS: ReadonlyArray<{ dot: string; who: string; does: string }> = [
  { dot: "bg-coral", who: "L'agent", does: "décide quoi faire" },
  { dot: "bg-[#5b8fcb]", who: "Ton code, ou un service tiers,", does: "fait l'action" },
  { dot: "bg-ok", who: "La boîte de support", does: "change" },
];

const HINT =
  "La boîte de support est le système que ton agent est chargé de gérer : les clients y écrivent, il y répond. Ce serait pareil avec ta base de données ou ton agenda.";

/**
 * La clé de lecture de la scène, en une ligne : qui décide, qui agit, ce qui
 * change. Et ce qu'est la boîte de support : le système que l'agent gère.
 */
export function SceneLegend() {
  return (
    <div className="mt-1 flex flex-col items-center gap-1 px-2 pb-1 text-center" title={HINT}>
      <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-line bg-panel/90 px-4 py-1.5 text-[13px] text-ink shadow-sm">
        {STEPS.map((step, index) => (
          <li key={step.who} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden="true" className="text-muted">
                →
              </span>
            )}
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${step.dot}`} />
            <span>
              <span className="font-semibold">{step.who}</span> {step.does}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-muted">Clique sur l&apos;agent, sa pile, le vault ou un panneau pour lire ce que c&apos;est.</p>
    </div>
  );
}
