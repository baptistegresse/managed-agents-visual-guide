"use client";

import { useEffect, useState } from "react";
import { localePath, type Locale } from "@/lib/i18n/locale";
import { uiStrings } from "@/lib/i18n/ui";
import { BASE_LESSONS, catalog, isBaseLesson, lessonById, nextBaseLesson } from "@/lib/lesson";
import { lessonView, stepCount } from "@/lib/lesson/play";
import { LocaleProvider } from "@/components/i18n/LocaleContext";
import { Scene } from "@/components/workshop/scene/Scene";
import { ChapterList } from "./ChapterList";
import { CodePanel } from "./CodePanel";
import { EventStrip } from "./EventStrip";
import { LocaleSwitch } from "./LocaleSwitch";
import { StepPanel } from "./StepPanel";

/** Un fond clair au centre, un peu plus chaud sur les bords : la pièce s'en détache mieux. */
const SCENE_BACKDROP = "radial-gradient(ellipse at 50% 45%, #fffdf9 0%, #f8f2e7 70%, #f1e9da 100%)";
const NEXT_KEYS: ReadonlySet<string> = new Set(["ArrowRight", " ", "Enter"]);
const BACK_KEY = "ArrowLeft";

interface Position {
  readonly lessonId: string;
  readonly index: number;
}

interface LessonPlayerProps {
  /** La langue de la page à son ouverture : celle de son adresse. */
  initialLocale: Locale;
}

/**
 * La page : on suit les bases chapitre par chapitre, étape par étape. À gauche
 * ce qui se passe, au centre la pièce de l'agent, à droite le code qui le
 * réalise, et dessous les événements que ton backend reçoit. Les annexes ne
 * s'ouvrent qu'une fois les bases terminées. Changer de langue garde l'étape
 * en cours : les chapitres et les étapes sont les mêmes dans les deux langues.
 */
export function LessonPlayer({ initialLocale }: LessonPlayerProps) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [position, setPosition] = useState<Position>({ lessonId: BASE_LESSONS[0].id, index: 0 });
  const [finished, setFinished] = useState<ReadonlySet<string>>(new Set());
  const [areExtrasOpen, setExtrasOpen] = useState(false);

  const ui = uiStrings(locale);
  const { bases, extras } = catalog(locale);
  const lesson = lessonById(position.lessonId, locale);
  const lastIndex = stepCount(lesson) - 1;
  const index = Math.min(position.index, lastIndex);
  const step = lesson.steps[index];
  const view = lessonView(lesson, index);
  const knownCount = index > 0 ? lessonView(lesson, index - 1).run.eventCount : 0;
  const isLastStep = index >= lastIndex;
  const nextChapter = nextBaseLesson(lesson.id, locale);
  const isEndOfBases = isBaseLesson(lesson.id) && nextChapter === null;
  const afterLabel = nextChapter
    ? ui.player.nextChapter(nextChapter.title)
    : isEndOfBases && !areExtrasOpen
      ? ui.player.openExtras
      : null;

  const goTo = (target: number): void => {
    const next = Math.min(lastIndex, Math.max(0, target));
    setPosition({ lessonId: lesson.id, index: next });
    if (next === lastIndex) setFinished((previous) => new Set([...previous, lesson.id]));
  };
  const open = (lessonId: string): void => setPosition({ lessonId, index: 0 });
  /** La suite : l'étape suivante, puis le chapitre suivant, puis les annexes. */
  const advance = (): void => {
    if (!isLastStep) return goTo(index + 1);
    if (nextChapter) return open(nextChapter.id);
    if (isEndOfBases) setExtrasOpen(true);
  };
  const back = (): void => goTo(index - 1);
  /** L'adresse suit la langue, sans recharger la page : un lien partagé s'ouvre dans la bonne langue. */
  const changeLocale = (next: Locale): void => {
    setLocale(next);
    window.history.replaceState(null, "", localePath(next));
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = ui.meta.title;
  }, [locale, ui.meta.title]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      // Un bouton qui a le focus garde Entrée et Espace pour lui : la touche ne fait pas avancer deux fois.
      const isOnButton = event.target instanceof HTMLButtonElement;
      if (NEXT_KEYS.has(event.key) && !(isOnButton && event.key !== "ArrowRight")) {
        event.preventDefault();
        advance();
      }
      if (event.key === BACK_KEY) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <LocaleProvider value={locale}>
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] grid-cols-1 gap-4 p-4 lg:h-screen lg:grid-cols-[20rem_minmax(0,1fr)_minmax(0,29rem)] lg:grid-rows-[auto_minmax(0,1fr)_10rem]">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:col-span-3">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">{ui.player.title}</h1>
          <p className="text-sm text-muted">{ui.player.tagline}</p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <p className="rounded-full bg-coral/15 px-2.5 py-0.5 text-xs text-coral-dark">{ui.player.illustration}</p>
            <LocaleSwitch locale={locale} onChange={changeLocale} />
          </div>
        </header>

        <aside className="flex min-h-0 flex-col gap-4 lg:col-start-1 lg:row-span-2 lg:row-start-2">
          <StepPanel lesson={lesson} index={index} onNext={advance} afterLabel={afterLabel} onBack={back} onJump={goTo} />
          <ChapterList
            bases={bases}
            extras={extras}
            currentId={lesson.id}
            finished={finished}
            areExtrasOpen={areExtrasOpen}
            onOpen={open}
            onShowExtras={() => setExtrasOpen(true)}
          />
        </aside>

        <section
          onClick={advance}
          className={`flex items-center justify-center rounded-2xl border border-line p-3 lg:col-start-2 lg:row-start-2 lg:min-h-0 ${
            !isLastStep || afterLabel ? "cursor-pointer" : ""
          }`}
          style={{ background: SCENE_BACKDROP }}
          aria-label={ui.player.sceneLabel}
        >
          <div className="w-full max-w-[min(100%,calc((100vh-19rem)*1.25))]">
            <Scene run={view.run} pieces={view.pieces} facts={view.facts} />
          </div>
        </section>

        <div className="min-h-[18rem] lg:col-start-3 lg:row-span-2 lg:row-start-2 lg:min-h-0">
          <CodePanel files={lesson.files} focus={step.code} stepId={`${lesson.id}:${step.id}`} />
        </div>

        <div className="lg:col-start-2 lg:row-start-3 lg:min-h-0">
          <EventStrip events={view.run.events} knownCount={knownCount} />
        </div>
      </div>
    </LocaleProvider>
  );
}
