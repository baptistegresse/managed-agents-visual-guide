"use client";

import { partById, type PartId } from "@/lib/workshop/parts";

interface PartCardProps {
  focus: PartId;
}

/**
 * La fiche de la partie sur laquelle on a cliqué : ce que c'est, où ça tourne,
 * et ce que ça devient dans le code. Elle disparaît quand on dézoome.
 */
export function PartCard({ focus }: PartCardProps) {
  if (focus === "overview") return null;
  const part = partById(focus);
  return (
    <aside className="pointer-events-none absolute bottom-14 left-3 z-10 w-72 rounded-xl border border-line bg-panel/95 p-3 shadow-lg backdrop-blur-sm">
      <h3 className="font-serif text-base font-semibold text-ink">{part.label}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-ink">{part.what}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{part.who}</p>
      <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-night px-2 py-1.5 font-mono text-[10.5px] text-[#f1e9dc]">
        {part.code}
      </p>
      <p className="mt-2 text-[11px] text-muted">Clique ailleurs dans la scène pour revenir à la vue d&apos;ensemble.</p>
    </aside>
  );
}
