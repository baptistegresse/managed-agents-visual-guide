"use client";

import { cameraFor, visibleFrame } from "@/lib/workshop/camera";
import { KEY_CATALOG, TOOL_CATALOG, type KeyId } from "@/lib/workshop/catalog";
import { openContext, recordInContext, type ContextWindow } from "@/lib/workshop/context";
import type { Hop } from "@/lib/workshop/effects";
import type { Layer } from "@/lib/workshop/intro";
import { AGENT_DESK, AGENT_HOME, SCENE_VIEW, THREAD_SPOTS } from "@/lib/workshop/layout";
import { partFrame, PARTS, type PartId } from "@/lib/workshop/parts";
import type { Actor, RunState } from "@/lib/workshop/run";
import { STEPS, type StepId, type WorkshopState } from "@/lib/workshop/state";
import { AgentModel } from "./AgentModel";
import { ContextStack } from "./ContextStack";
import { KeyFlight } from "./Effects";
import { DeploymentClock } from "./EntryConsole";
import { LibraryModel } from "./Extras";
import { BedBlanket, BedModel, VaultModel } from "./Furniture";
import { HopLine } from "./HopLine";
import { Hotspots } from "./Hotspots";
import { Stage, type Phase } from "./iso";
import { BudgetGauge, GraderCard, Overlays, VIEW } from "./Overlays";
import { RoomBlueprint, SessionRoom } from "./Room";
import { NightstandModel, WorkbenchModel } from "./Sandbox";
import { ThreadCopy } from "./Worker";

/** Pendant l'introduction, la scène ne montre que ce que les chapitres ont déjà posé. */
export interface IntroView {
  readonly layers: ReadonlySet<Layer>;
  /** La liaison que le chapitre montre en ce moment. */
  readonly hop: Hop | null;
  /** Ce que dit le modèle, et la partie qu'il faut cliquer pour passer à la suite. */
  readonly says: string | null;
  readonly target: PartId;
}

interface SceneProps {
  workshop: WorkshopState;
  run: RunState;
  phases: ScenePhases;
  isCronOn: boolean;
  /** La partie sur laquelle la caméra est posée. */
  focus: PartId;
  /** On a cliqué sur une partie de la scène, ou à côté (« overview »). */
  onPick: (part: PartId) => void;
  intro: IntroView | null;
}

/** L'état de chaque pièce de la scène, selon l'introduction, l'étape du parcours et la configuration. */
export interface ScenePhases {
  readonly room: Phase;
  readonly vault: Phase;
  readonly rack: Phase;
  readonly agent: Phase;
  readonly bed: Phase;
  readonly context: Phase;
  readonly entries: Phase;
  readonly bench: Phase;
  readonly memory: Phase;
  readonly library: Phase;
  readonly web: Phase;
  readonly app: Phase;
  readonly world: Phase;
  /** Les services tiers branchés à l'agent : ceux dont il a reçu un outil. */
  readonly services: readonly KeyId[];
}

/** Pendant l'introduction, le modèle se tient debout, éveillé, là où il réfléchira plus tard. */
const INTRO_ACTOR: Actor = { position: AGENT_DESK, moveMs: 0, mood: "idle", carrying: null, bubble: null };
const INTRO_AGENT_LABEL = "Claude, un modèle";
/** Un contexte d'exemple pour l'introduction : des consignes, des outils, puis un premier échange. */
const INTRO_CONTEXT: ContextWindow = [
  { name: "user.message", detail: "Réponds au ticket d'Alice." },
  { name: "agent.custom_tool_use", detail: 'reply_ticket({"ticket":1})' },
  { name: "user.custom_tool_result", detail: "Réponse envoyée à Alice." },
  { name: "agent.message", detail: "C'est réglé." },
].reduce(
  recordInContext,
  openContext({
    system: "Tu réponds aux clients du support.",
    toolLines: ["reply_ticket : envoie une réponse au client", "lookup_order : retrouve une commande"],
  }),
);
const CAMERA_MS = 700;

/** Avant son étape une pièce n'est qu'un plan, pendant elle est en aperçu, après elle est construite. */
function phaseOf(own: StepId, current: StepId, isBuilt: boolean): Phase {
  if (isBuilt) return "built";
  return STEPS.indexOf(current) < STEPS.indexOf(own) ? "ghost" : "preview";
}

/** Pendant l'introduction : ce que les chapitres ont déjà posé est là, le reste n'existe pas encore. */
export function introPhases(layers: ReadonlySet<Layer>): ScenePhases {
  const on = (layer: Layer): Phase => (layers.has(layer) ? "built" : "hidden");
  return {
    room: on("room"),
    vault: "hidden",
    rack: on("app"),
    agent: on("agent"),
    bed: on("room"),
    context: on("context"),
    entries: on("entries"),
    bench: "hidden",
    memory: "hidden",
    library: "hidden",
    web: "hidden",
    app: on("app"),
    world: on("desk"),
    services: [],
  };
}

/** Pendant la construction : chaque pièce suit l'étape qui la crée. */
export function buildPhases(workshop: WorkshopState, step: StepId): ScenePhases {
  const config = workshop.session.config;
  const enabledTools = config?.enabledTools ?? workshop.tools.enabled;
  const rack = phaseOf("tools", step, workshop.tools.isConfirmed);
  const agent = phaseOf("agent", step, workshop.agent.id !== null);
  const session = phaseOf("session", step, workshop.session.id !== null);
  const toolOwners = TOOL_CATALOG.filter((tool) => enabledTools.includes(tool.id)).map((tool) => tool.requiresKey);
  // Une option qu'on n'a pas choisie n'existe pas du tout ; choisie, elle suit sa pièce.
  const optional = (isChosen: boolean, phase: Phase): Phase => (isChosen ? phase : "hidden");
  return {
    room: phaseOf("environment", step, workshop.environment.id !== null),
    vault: phaseOf("vault", step, workshop.vault.id !== null),
    rack,
    agent,
    bed: agent,
    context: session,
    entries: session,
    bench: optional(workshop.tools.sandbox !== "off", rack),
    memory: optional(workshop.session.hasMemory, session),
    library: optional(workshop.agent.hasSkill, agent),
    web: optional(workshop.tools.hasWeb && workshop.tools.sandbox !== "off", rack),
    app: "built",
    world: "built",
    services: rack === "built" ? KEY_CATALOG.map((key) => key.id).filter((id) => toolOwners.includes(id)) : [],
  };
}

/** Un objet de la pièce n'est cliquable que s'il est posé, ne serait-ce qu'à l'état de plan. */
function isOnScene(part: PartId, phases: ScenePhases): boolean {
  const phaseOfPart: Readonly<Partial<Record<PartId, Phase>>> = {
    agent: phases.agent,
    context: phases.context,
    vault: phases.vault,
  };
  return (phaseOfPart[part] ?? "hidden") !== "hidden";
}

/**
 * La scène : la pièce de l'agent, et rien d'autre. C'est la session, chez
 * Anthropic. Ton application et le monde extérieur sont des panneaux de part et
 * d'autre ; les appels sortent de la pièce par ses bords pour les rejoindre.
 */
export function Scene({ workshop, run, phases, isCronOn, focus, onPick, intro }: SceneProps) {
  // Pendant l'introduction, rien ne tourne : on montre le modèle et la liaison du chapitre.
  const shown: RunState = intro
    ? { ...run, actor: { ...INTRO_ACTOR, bubble: intro.says }, hop: intro.hop, context: INTRO_CONTEXT }
    : run;
  const { actor, hop } = shown;
  const isAtHome = actor.position.x === AGENT_HOME.x && actor.position.y === AGENT_HOME.y;
  const isAsleep = phases.agent === "built" && isAtHome && actor.mood === "idle";
  const camera = cameraFor(partFrame(focus), SCENE_VIEW);
  const frame = visibleFrame(camera, SCENE_VIEW);
  // Pendant l'introduction, seul ce que le chapitre demande répond ; ensuite, tout objet posé.
  const objects = PARTS.map((part) => part.id).filter((id) => isOnScene(id, phases));
  const clickable = intro ? objects.filter((id) => id === intro.target) : objects;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl ${focus !== "overview" && !intro ? "cursor-zoom-out" : ""}`}
      style={{ aspectRatio: `${VIEW.width} / ${VIEW.height}` }}
      onClick={() => onPick("overview")}
    >
      <div
        className="absolute inset-0 origin-top-left ease-in-out"
        style={{
          transform: `translate(${camera.offsetX * 100}%, ${camera.offsetY * 100}%) scale(${camera.scale})`,
          transition: `transform ${CAMERA_MS}ms`,
        }}
      >
        <svg
          viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Vue isométrique de la session : la pièce où l'agent décide, avec son contexte, son conteneur et le vault"
        >
          {phases.room === "preview" && <RoomBlueprint />}
          <Stage phase={phases.room}>
            <SessionRoom networking={workshop.environment.networking} />
          </Stage>
          <Stage phase={phases.vault}>
            <VaultModel keys={workshop.vault.keys} isShaking={run.activeKey?.isDenied ?? false} />
          </Stage>
          <Stage phase={phases.library}>
            <LibraryModel isActive={run.activeSpot === "library"} />
          </Stage>
          <Stage phase={phases.bench}>
            <WorkbenchModel
              isActive={run.terminal !== null}
              fileCount={run.files.length}
              hasMountedFile={workshop.session.hasPlan}
            />
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
            <ContextStack context={shown.context} />
          </Stage>
          <Stage phase={phases.entries}>
            <DeploymentClock isActive={run.activeEntry === "cron"} isOn={isCronOn} />
          </Stage>
          {run.helpers.map((helper, index) => (
            <ThreadCopy key={helper.id} position={THREAD_SPOTS[index % THREAD_SPOTS.length]} />
          ))}

          {run.activeKey && <KeyFlight activeKey={run.activeKey} frame={frame} />}
          {hop && <HopLine key={`${hop.from}-${hop.to}-${hop.label}`} hop={hop} agent={actor.position} frame={frame} />}
          <Hotspots
            parts={clickable}
            focus={intro ? "overview" : focus}
            target={intro?.target ?? null}
            agentAt={actor.position}
            zoom={camera.scale}
            onPick={onPick}
          />
        </svg>

        <Overlays
          workshop={workshop}
          run={shown}
          phases={phases}
          isAsleep={isAsleep}
          agentLabel={intro ? INTRO_AGENT_LABEL : undefined}
          onFocus={onPick}
          target={intro?.target ?? null}
          frame={frame}
        />
      </div>

      {/* Ce qui suit ne zoome pas avec la scène. */}
      <BudgetGauge run={run} />
      <GraderCard run={run} />
    </div>
  );
}
