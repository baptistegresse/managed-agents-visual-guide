"use client";

import { useEffect, useReducer, useState } from "react";
import { chapterAt, INTRO, visibleLayers } from "@/lib/workshop/intro";
import { isUnlocked, type Feature } from "@/lib/workshop/journey";
import type { PartId } from "@/lib/workshop/parts";
import { entrySnippet, momentSnippet, snippetFor } from "@/lib/workshop/snippets";
import { createWorkshop, currentStep, workshopReducer, type StepId } from "@/lib/workshop/state";
import { GuideContext } from "./guide";
import { IntroPanel } from "./IntroPanel";
import { MissionPanel } from "./MissionPanel";
import { ContextPanel } from "./ContextPanel";
import { CodePanel, EventPanel } from "./Panels";
import { buildPhases, introPhases, Scene } from "./scene/Scene";
import { SceneLegend } from "./SceneLegend";
import { PartCard } from "./SceneZoom";
import { AppPanel, WorldPanel } from "./SidePanels";
import { StepList } from "./StepList";
import { useAgentRun } from "./useAgentRun";

/** Un fond clair au centre, un peu plus chaud sur les bords : la scène s'en détache mieux. */
const SCENE_BACKDROP = "radial-gradient(ellipse at 50% 45%, #fffdf9 0%, #f8f2e7 70%, #f1e9da 100%)";

/** Pendant qu'on pose une pièce, la caméra va la montrer ; une fois la session ouverte, on voit tout. */
const STEP_FOCUS: Readonly<Record<StepId, PartId>> = {
  environment: "overview",
  vault: "vault",
  tools: "overview",
  agent: "agent",
  session: "overview",
};
/** Durée d'affichage de chaque liaison quand un chapitre en montre plusieurs à la suite. */
const LINK_MS = 1_500;

/** Un zoom choisi à la main ne vaut que pour le moment où il a été choisi. */
interface ChosenFocus {
  readonly moment: string;
  readonly part: PartId;
}

/** L'atelier : à gauche le parcours pas à pas, à droite la scène qui se construit. */
export function Workshop() {
  const [workshop, dispatch] = useReducer(workshopReducer, undefined, createWorkshop);
  const agentRun = useAgentRun(workshop);
  const { run, resetRun } = agentRun;
  const step = currentStep(workshop);
  // Le code affiché suit ce qui se passe : un accord attendu, un budget atteint, un objectif,
  // sinon le dernier point d'entrée utilisé, sinon l'étape en cours.
  const code =
    run.status === "rescheduling" || run.status === "terminated"
      ? momentSnippet("error")
      : run.status === "waiting_approval"
      ? momentSnippet("approval")
      : run.status === "paused_budget"
        ? momentSnippet("budget")
        : run.outcome
          ? momentSnippet("outcome")
          : workshop.session.agentVersion !== null && workshop.agent.version > workshop.session.agentVersion
            ? momentSnippet("version")
            : workshop.session.id && run.lastEntry
            ? entrySnippet(run.lastEntry)
            : snippetFor(step, workshop);

  // L'introduction passe d'abord ; `null` une fois terminée.
  const [introIndex, setIntroIndex] = useState<number | null>(0);
  const [linkTick, setLinkTick] = useState(0);
  const chapter = introIndex === null ? null : chapterAt(introIndex);
  const linkCount = chapter?.links.length ?? 0;
  useEffect(() => {
    if (linkCount < 2) return;
    const timer = setInterval(() => setLinkTick((tick) => tick + 1), LINK_MS);
    return () => clearInterval(timer);
  }, [linkCount, introIndex]);
  const intro =
    chapter && introIndex !== null
      ? {
          layers: visibleLayers(introIndex),
          hop: linkCount > 0 ? chapter.links[linkTick % linkCount] : null,
          says: chapter.says,
          target: chapter.target,
        }
      : null;

  const phases = intro ? introPhases(intro.layers) : buildPhases(workshop, step);

  // La caméra suit le chapitre ou l'étape en cours, sauf si on a zoomé ailleurs depuis.
  const moment = introIndex !== null ? `intro:${introIndex}` : `${step}:${workshop.session.id ?? "build"}`;
  const [chosen, setChosen] = useState<ChosenFocus | null>(null);
  const followed: PartId = chapter ? chapter.focus : workshop.session.id ? "overview" : STEP_FOCUS[step];
  const focus = chosen?.moment === moment ? chosen.part : followed;
  /**
   * Un clic dans la scène. Pendant l'introduction, cliquer sur ce dont parle le
   * chapitre fait passer au suivant ; ensuite, cliquer sur une partie zoome
   * dessus, et cliquer à côté ou dessus à nouveau ramène à la vue d'ensemble.
   */
  const pick = (part: PartId): void => {
    if (chapter && introIndex !== null) {
      if (part !== chapter.target) return;
      setIntroIndex(introIndex >= INTRO.length - 1 ? null : introIndex + 1);
      return;
    }
    setChosen({ moment, part: part === focus ? "overview" : part });
  };

  const [isFreeMode, setFreeMode] = useState(false);
  const unlocked = (feature: Feature): boolean => isUnlocked(feature, workshop, agentRun.journey, isFreeMode);

  // Fermer la session rouvre ses réglages : on choisit budget, mémoire et fichier avant la suivante.
  const newSession = (): void => {
    agentRun.endSession();
    dispatch({ type: "sessionEnded" });
  };

  const restart = (): void => {
    resetRun();
    dispatch({ type: "reset" });
  };

  return (
    <GuideContext.Provider value={unlocked}>
    <div className="mx-auto grid min-h-screen w-full max-w-[1500px] grid-cols-1 gap-4 p-4 lg:h-screen lg:grid-cols-[23rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_13rem]">
      <header className="lg:col-start-1 lg:row-start-1">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">Atelier d&apos;agent</h1>
          <p className="mt-1 text-sm text-muted">Comprends ce qu&apos;est un agent, puis construis-en un pour un support client avec Managed Agents.</p>
          <p className="mt-2 inline-block rounded-full bg-coral/15 px-2.5 py-0.5 text-xs text-coral-dark">
            Simulation : aucun appel à l&apos;API
          </p>
      </header>

      <section
        className={`relative flex flex-col items-center justify-center rounded-2xl border border-line p-2 lg:col-start-2 lg:row-start-1 lg:min-h-0 ${
          intro ? "lg:row-span-3" : "lg:row-span-2"
        }`}
        style={{ background: SCENE_BACKDROP }}
      >
        <div className="grid w-full grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,14rem)]">
          <AppPanel
            workshop={workshop}
            run={run}
            phases={phases}
            focus={focus}
            target={intro?.target ?? null}
            onPick={pick}
            isWebhookOn={agentRun.isWebhookOn}
          />
          <div className={`mx-auto w-full ${intro ? "max-w-[min(100%,calc((100vh-7rem)*1.25))]" : "max-w-[min(100%,calc((100vh-21rem)*1.25))]"}`}>
            <Scene
              workshop={workshop}
              run={run}
              phases={phases}
              isCronOn={agentRun.isCronOn}
              focus={focus}
              onPick={pick}
              intro={intro}
            />
          </div>
          <WorldPanel
            workshop={workshop}
            run={run}
            phases={phases}
            focus={focus}
            target={intro?.target ?? null}
            onPick={pick}
          />
        </div>
        {!intro && <SceneLegend />}
        {!intro && <PartCard focus={focus} />}
      </section>

      <aside className="flex flex-col gap-4 lg:col-start-1 lg:row-span-2 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto">
        {introIndex !== null ? (
          <IntroPanel index={introIndex} onMove={setIntroIndex} onSkip={() => setIntroIndex(null)} />
        ) : (
          <>
            <MissionPanel
              workshop={workshop}
              journey={agentRun.journey}
              isFreeMode={isFreeMode}
              onToggleFreeMode={() => setFreeMode((previous) => !previous)}
            />
            <StepList
              workshop={workshop}
              dispatch={dispatch}
              step={step}
              session={{ agentRun, onNewSession: newSession }}
            />
            <div className="flex gap-4">
              <button type="button" onClick={() => setIntroIndex(0)} className="text-xs text-muted underline hover:text-ink">
                Revoir l&apos;introduction
              </button>
              <button type="button" onClick={restart} className="text-xs text-muted underline hover:text-ink">
                Tout recommencer
              </button>
            </div>
          </>
        )}
      </aside>

      {!intro && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:col-start-2 lg:row-start-3 lg:min-h-0">
          <CodePanel code={code} />
          <EventPanel events={run.events} />
          <ContextPanel context={run.context} />
        </div>
      )}
    </div>
    </GuideContext.Provider>
  );
}
