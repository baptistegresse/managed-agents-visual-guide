"use client";

import { useUi } from "@/components/i18n/LocaleContext";
import type { Piece, SceneFacts } from "@/lib/lesson/types";
import { AGENT_HOME, SCENE_VIEW, THREAD_SPOTS } from "@/lib/workshop/layout";
import type { RunState } from "@/lib/workshop/run";
import { AgentModel } from "./AgentModel";
import { ContextStack } from "./ContextStack";
import { KeyFlight } from "./Effects";
import { DeploymentClock } from "./EntryConsole";
import { LibraryModel } from "./Extras";
import { BedBlanket, BedModel, VaultModel } from "./Furniture";
import { HopLine } from "./HopLine";
import { Stage, type Phase } from "./iso";
import { BudgetGauge, GraderCard, Overlays } from "./Overlays";
import { SessionRoom } from "./Room";
import { NightstandModel, WorkbenchModel } from "./Sandbox";
import { ThreadCopy } from "./Worker";

interface SceneProps {
  run: RunState;
  /** Les pièces que la leçon a déjà posées. */
  pieces: ReadonlySet<Piece>;
  facts: SceneFacts;
}

/** L'état de chaque pièce de la scène : posée, ou pas encore là. */
export type ScenePhases = Readonly<Record<Piece, Phase>>;

const PIECES: readonly Piece[] = ["agent", "room", "vault", "bed", "context", "bench", "memory", "library", "clock"];

function phasesOf(pieces: ReadonlySet<Piece>): ScenePhases {
  return Object.fromEntries(PIECES.map((piece) => [piece, pieces.has(piece) ? "built" : "hidden"])) as ScenePhases;
}

/**
 * La scène : la pièce de l'agent, et rien d'autre. C'est la session, chez
 * Anthropic. Ton backend est à gauche, le monde extérieur à droite : les appels
 * sortent de la pièce par ses bords pour les rejoindre.
 */
export function Scene({ run, pieces, facts }: SceneProps) {
  const ui = useUi();
  const phases = phasesOf(pieces);
  const { actor, hop } = run;
  const isAtHome = actor.position.x === AGENT_HOME.x && actor.position.y === AGENT_HOME.y;
  const isAsleep = phases.bed === "built" && isAtHome && actor.mood === "idle";

  return (
    <div className="@container relative w-full" style={{ aspectRatio: `${SCENE_VIEW.width} / ${SCENE_VIEW.height}` }}>
      <svg
        viewBox={`${SCENE_VIEW.x} ${SCENE_VIEW.y} ${SCENE_VIEW.width} ${SCENE_VIEW.height}`}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={ui.scene.label}
      >
        <Stage phase={phases.room}>
          <SessionRoom networking={facts.networking} hasContainer={phases.bench === "built"} />
        </Stage>
        <Stage phase={phases.vault}>
          <VaultModel keys={facts.vaultKeys} isShaking={run.activeKey?.isDenied ?? false} />
        </Stage>
        <Stage phase={phases.library}>
          <LibraryModel isActive={run.activeSpot === "library"} />
        </Stage>
        <Stage phase={phases.bench}>
          <WorkbenchModel isActive={run.terminal !== null} fileCount={run.files.length} hasMountedFile={facts.hasMountedFile} />
        </Stage>
        <Stage phase={phases.memory}>
          <NightstandModel isActive={run.isUsingMemory} />
        </Stage>
        <Stage phase={phases.bed}>
          <BedModel />
          {!isAsleep && <BedBlanket />}
        </Stage>
        <Stage phase={phases.agent}>
          <AgentModel actor={actor} isAsleep={isAsleep} />
          {isAsleep && <BedBlanket />}
        </Stage>
        <Stage phase={phases.context}>
          <ContextStack context={run.context} />
        </Stage>
        <Stage phase={phases.clock}>
          <DeploymentClock isActive={run.activeEntry === "cron"} isOn={phases.clock === "built"} />
        </Stage>
        {run.helpers.map((helper, index) => (
          <ThreadCopy key={helper.id} position={THREAD_SPOTS[index % THREAD_SPOTS.length]} />
        ))}

        {run.activeKey && <KeyFlight activeKey={run.activeKey} frame={SCENE_VIEW} />}
        {hop && <HopLine key={`${hop.from}-${hop.to}-${hop.label}`} hop={hop} agent={actor.position} frame={SCENE_VIEW} />}
      </svg>

      <Overlays run={run} phases={phases} facts={facts} isAsleep={isAsleep} />
      <BudgetGauge run={run} />
      <GraderCard run={run} />
    </div>
  );
}
