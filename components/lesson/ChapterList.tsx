"use client";

import type { Lesson } from "@/lib/lesson/types";
import { useUi } from "@/components/i18n/LocaleContext";

interface ChapterListProps {
  bases: readonly Lesson[];
  extras: readonly Lesson[];
  currentId: string;
  /** Les chapitres déjà lus jusqu'au bout. */
  finished: ReadonlySet<string>;
  /** Les annexes ne s'affichent qu'une fois les bases terminées, ou sur demande. */
  areExtrasOpen: boolean;
  onOpen: (id: string) => void;
  onShowExtras: () => void;
}

interface ChapterRowProps {
  lesson: Lesson;
  /** Le rang du chapitre dans les bases ; absent pour une annexe. */
  rank?: number;
  isCurrent: boolean;
  isFinished: boolean;
  onOpen: (id: string) => void;
}

function ChapterRow({ lesson, rank, isCurrent, isFinished, onOpen }: ChapterRowProps) {
  return (
    <li>
      <button
        type="button"
        aria-current={isCurrent ? "true" : undefined}
        title={lesson.summary}
        onClick={() => onOpen(lesson.id)}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition ${
          isCurrent ? "border-coral bg-coral/10 font-medium text-ink" : "border-line bg-panel text-ink hover:border-coral"
        }`}
      >
        {rank !== undefined && (
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
              isFinished ? "bg-ok text-white" : isCurrent ? "bg-coral text-white" : "bg-line text-muted"
            }`}
          >
            {isFinished ? "✓" : rank}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
      </button>
    </li>
  );
}

/** Le sommaire : les bases dans l'ordre, puis les annexes une fois les bases terminées. */
export function ChapterList({ bases, extras, currentId, finished, areExtrasOpen, onOpen, onShowExtras }: ChapterListProps) {
  const ui = useUi();
  return (
    <nav aria-label={ui.chapters.label} className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">{ui.chapters.bases}</h3>
      <ol className="flex flex-col gap-1.5">
        {bases.map((lesson, position) => (
          <ChapterRow
            key={lesson.id}
            lesson={lesson}
            rank={position + 1}
            isCurrent={currentId === lesson.id}
            isFinished={finished.has(lesson.id)}
            onOpen={onOpen}
          />
        ))}
      </ol>
      <h3 className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">{ui.chapters.extras}</h3>
      {areExtrasOpen ? (
        <ul className="flex flex-col gap-1.5">
          {extras.map((lesson) => (
            <ChapterRow
              key={lesson.id}
              lesson={lesson}
              isCurrent={currentId === lesson.id}
              isFinished={finished.has(lesson.id)}
              onOpen={onOpen}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs leading-relaxed text-muted">
          {ui.chapters.locked}{" "}
          <button type="button" onClick={onShowExtras} className="underline underline-offset-2 hover:text-ink">
            {ui.chapters.showNow}
          </button>
        </p>
      )}
    </nav>
  );
}
