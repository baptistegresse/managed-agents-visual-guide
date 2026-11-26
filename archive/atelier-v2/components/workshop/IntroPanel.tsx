"use client";

import { chapterAt, INTRO } from "@/lib/workshop/intro";

interface IntroPanelProps {
  index: number;
  /** Revient à un chapitre déjà vu. */
  onMove: (index: number) => void;
  /** Ferme l'introduction et ouvre le parcours de construction. */
  onSkip: () => void;
}

/**
 * L'introduction : qu'est-ce qu'un agent, une idée par chapitre. On avance en
 * cliquant dans la scène sur ce dont le chapitre parle ; ce panneau ne fait que
 * raconter, et dire où cliquer.
 */
export function IntroPanel({ index, onMove, onSkip }: IntroPanelProps) {
  const chapter = chapterAt(index);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-coral/40 bg-coral/5 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-coral-dark">
          Introduction · {index + 1} / {INTRO.length}
        </p>
        <button type="button" onClick={onSkip} className="text-xs text-muted underline hover:text-ink">
          Passer
        </button>
      </div>
      <ol className="flex gap-1.5" aria-label="Chapitres de l'introduction">
        {INTRO.map((each, position) => (
          <li key={each.id} className="flex-1">
            <button
              type="button"
              aria-label={`Chapitre ${position + 1} : ${each.title}`}
              aria-current={position === index ? "step" : undefined}
              disabled={position > index}
              title={position < index ? `Revenir à « ${each.title} »` : undefined}
              onClick={() => onMove(position)}
              className={`block h-1.5 w-full rounded-full transition ${position <= index ? "bg-coral" : "bg-line"}`}
            />
          </li>
        ))}
      </ol>
      <h2 className="font-serif text-xl font-semibold leading-tight text-ink">{chapter.title}</h2>
      {chapter.lines.map((line) => (
        <p key={line} className="text-sm leading-relaxed text-ink">
          {line}
        </p>
      ))}
      <p className="mt-1 flex items-center gap-2 rounded-lg bg-coral/15 px-3 py-2 text-sm font-medium text-coral-dark">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-coral" />
        </span>
        {chapter.prompt}
      </p>
    </section>
  );
}
