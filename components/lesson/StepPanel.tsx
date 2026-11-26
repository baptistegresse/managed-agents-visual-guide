"use client";

import type { Lesson } from "@/lib/lesson/types";
import { useUi } from "@/components/i18n/LocaleContext";

interface StepPanelProps {
  lesson: Lesson;
  index: number;
  /** Passe à la suite : l'étape suivante, ou ce qui vient après le chapitre. */
  onNext: () => void;
  /** Ce qui vient après la dernière étape, s'il y a une suite : le chapitre suivant, les annexes. */
  afterLabel: string | null;
  onBack: () => void;
  onJump: (index: number) => void;
}

/**
 * Le texte de l'étape en cours : où on en est, ce qui se passe, ce qu'il faut
 * en retenir. Un clic n'importe où sur la carte fait passer à la suite.
 */
export function StepPanel({ lesson, index, onNext, afterLabel, onBack, onJump }: StepPanelProps) {
  const ui = useUi();
  const step = lesson.steps[index];
  const isLast = index >= lesson.steps.length - 1;
  const canContinue = !isLast || afterLabel !== null;
  return (
    <section
      onClick={onNext}
      className={`flex flex-col gap-3 rounded-2xl border border-coral/40 bg-coral/5 p-5 ${canContinue ? "cursor-pointer hover:bg-coral/10" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-coral-dark">
          {ui.step.progress(index + 1, lesson.steps.length)}
        </p>
        <p className="truncate text-xs text-muted">{lesson.title}</p>
      </div>
      <ol className="flex gap-1" aria-label={ui.step.listLabel}>
        {lesson.steps.map((each, position) => (
          <li key={each.id} className="flex-1">
            <button
              type="button"
              aria-label={ui.step.stepLabel(position + 1, each.title)}
              aria-current={position === index ? "step" : undefined}
              title={each.title}
              onClick={(event) => {
                event.stopPropagation();
                onJump(position);
              }}
              className={`block h-1.5 w-full rounded-full transition hover:bg-coral/60 ${position <= index ? "bg-coral" : "bg-line"}`}
            />
          </li>
        ))}
      </ol>
      <h2 className="font-serif text-2xl font-semibold leading-tight text-ink">{step.title}</h2>
      {step.text.map((line) => (
        <p key={line} className="text-[15px] leading-relaxed text-ink">
          {line}
        </p>
      ))}
      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          disabled={index === 0}
          onClick={(event) => {
            event.stopPropagation();
            onBack();
          }}
          className="text-sm text-muted underline-offset-2 hover:text-ink hover:underline disabled:invisible"
        >
          {ui.step.back}
        </button>
        <p
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${canContinue ? "bg-coral text-white" : "bg-line text-muted"}`}
        >
          {!isLast ? ui.step.next : (afterLabel ?? ui.step.end)}
        </p>
      </div>
    </section>
  );
}
