import type { GridPoint } from "@/lib/iso/projection";
import { playBuiltin, playMemory, sandboxCall, webCall } from "./builtins";
import { hop, NO_HOP, playAppCall, playServiceCall, workerWalk } from "./calls";
import { toolSpec, type KeyId } from "./catalog";
import type { Desk } from "./desk";
import {
  ENTRY_EVENT_NAMES,
  event,
  flatten,
  speech,
  type Beat,
  type Effect,
  type EntryPoint,
  type Place,
  type SandboxPolicy,
  type Step,
  type Timeline,
} from "./effects";
import { AGENT_DESK, AGENT_HOME, travelMs, WORKER_HOME } from "./layout";
import type { PlanStep } from "./planner";
import type { Continue, Progress } from "./progress";
import { isDelegable, playTeam, TEAM_MIN_CALLS } from "./team";

export * from "./effects";
export type { Continue, Progress } from "./progress";

export interface TimelineContext {
  readonly desk: Desk;
  readonly keys: readonly KeyId[];
  readonly start: GridPoint;
  /**
   * Le point d'entrée qui réveille l'agent. La boîte de support fournie contient
   * déjà le ticket qui arrive : il est montré à l'écran avant que l'agent n'ouvre les yeux.
   */
  readonly entry?: EntryPoint;
  readonly sandbox?: SandboxPolicy;
  /** L'agent peut confier un gros travail à des copies de lui-même. */
  readonly canDelegate?: boolean;
  readonly memory?: readonly string[];
}

const THINK_MS = 900;
const ALARM_MS = 1000;

type Call = Extract<PlanStep, { type: "call" }>;
type Say = Extract<PlanStep, { type: "say" }>;

/** Un appel est sauté si son outil, ou celui dont il dépend, a été refusé faute de clé pendant ce tour. */
function isSkipped(step: Call, progress: Progress): boolean {
  const { deniedTools } = progress;
  return deniedTools.includes(step.tool) || (step.dependsOn !== undefined && deniedTools.includes(step.dependsOn));
}

/** Une phrase de bilan ne se dit que si le tour s'est passé comme elle le suppose. */
function isSpoken(step: Say, progress: Progress): boolean {
  if (!step.when) return true;
  return (step.when === "denied") === progress.deniedTools.length > 0;
}

/** Les appels en tête du plan que l'agent peut confier à des copies, tant qu'aucune autre étape ne s'intercale. */
function delegableRun(plan: readonly PlanStep[]): Call[] {
  const end = plan.findIndex((step) => !isDelegable(step));
  return plan.slice(0, end === -1 ? plan.length : end).filter(isDelegable);
}

function playCall(
  step: Call,
  plan: readonly PlanStep[],
  progress: Progress,
  context: TimelineContext,
  done: Continue,
): Step[] {
  const rest = plan.slice(1);
  const next: Continue = (after) => playPlan(rest, after, context, done);
  if (isSkipped(step, progress)) return next(progress);

  const run = context.canDelegate ? delegableRun(plan) : [];
  const shared = run.filter((each) => !isSkipped(each, progress));
  if (shared.length >= TEAM_MIN_CALLS) {
    const team = playTeam(shared, progress.desk, context.keys);
    return [...team.beats, ...playPlan(plan.slice(run.length), { ...progress, desk: team.desk }, context, done)];
  }
  if (toolSpec(step.tool).requiresKey !== null) return playServiceCall(progress, step, context.keys, next, done);
  const played = playAppCall(progress, step.tool, step.input, context.keys);
  return [...played.beats, ...next(played.progress)];
}

/**
 * Joue un plan étape par étape ; `done` construit la fin une fois l'état final
 * connu. C'est aussi la fin du tour quand tu refuses un appel : l'agent abandonne le reste.
 */
export function playPlan(
  plan: readonly PlanStep[],
  progress: Progress,
  context: TimelineContext,
  done: Continue,
): Step[] {
  if (plan.length === 0) return done(progress);
  const [step, ...rest] = plan;
  const next: Continue = (after) => playPlan(rest, after, context, done);

  switch (step.type) {
    case "say":
      return isSpoken(step, progress) ? [speech(step.text), ...next(progress)] : next(progress);
    case "memory":
      return playMemory(step, progress, next);
    case "sandbox":
      return playBuiltin(sandboxCall(step), progress, context.sandbox ?? "off", next, done);
    case "web":
      return playBuiltin(webCall(step), progress, context.sandbox ?? "off", next, done);
    case "call":
      return playCall(step, plan, progress, context, done);
  }
}

function isSamePoint(left: GridPoint, right: GridPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

/** La fin d'un tour : la session repasse en attente, l'agent retourne se coucher et ton code rentre chez lui. */
export function closing(at: GridPoint, workerAt: GridPoint = WORKER_HOME): Beat[] {
  const agentMs = travelMs(at, AGENT_HOME);
  const [firstLeg, ...otherLegs] = isSamePoint(workerAt, WORKER_HOME) ? [] : workerWalk(workerAt, WORKER_HOME);
  return [
    {
      durationMs: Math.max(agentMs, firstLeg?.durationMs ?? 0),
      effects: [
        event("session.status_idle", "end_turn : le tour est terminé", "session"),
        NO_HOP,
        { type: "mood", mood: "walking" },
        { type: "move", to: AGENT_HOME, durationMs: agentMs },
        ...(firstLeg?.effects ?? []),
      ],
    },
    ...otherLegs,
    {
      durationMs: 0,
      effects: [
        // L'écran ne redevient disponible qu'une fois tout le monde rentré : une consigne envoyée avant serait perdue.
        { type: "status", status: "idle" },
        { type: "bubble", text: null },
        { type: "mood", mood: "idle" },
      ],
    },
  ];
}

/** D'où part le message qui démarre le tour, selon le point d'entrée. */
const ENTRY_PLACE: Readonly<Record<EntryPoint, Place>> = { api: "app", webhook: "webhook", cron: "cron" };

/**
 * Le point d'entrée se déclenche et le ticket apparaît, avant que l'agent n'ouvre
 * les yeux. Un webhook vient du monde extérieur jusqu'à ton application ; un
 * déploiement planifié, lui, ouvre une nouvelle session tout seul, côté Anthropic.
 */
export function alarm(entry: EntryPoint, detail: string, desk: Desk): Beat {
  const isDeployment = entry === "cron";
  return {
    durationMs: ALARM_MS,
    effects: [
      { type: "status", status: "running" },
      { type: "entry", point: entry },
      ...(isDeployment ? [{ type: "freshSession" } as const] : []),
      event(ENTRY_EVENT_NAMES[entry], isDeployment ? `${detail} Nouvelle session : contexte vierge.` : detail, "entry"),
      { type: "desk", desk },
      ...(entry === "webhook" ? [hop("desk", "webhook", "ticket", "entry")] : []),
    ],
  };
}

/** Le message arrive dans la session : l'agent se lève et va se placer devant sa fenêtre de contexte. */
export function wakeUp(start: GridPoint, entry: EntryPoint = "api", label = "user.message"): Effect[] {
  return [
    hop(ENTRY_PLACE[entry], "agent", label, "entry"),
    { type: "mood", mood: "thinking" },
    ...(isSamePoint(start, AGENT_DESK)
      ? []
      : [{ type: "move", to: AGENT_DESK, durationMs: travelMs(start, AGENT_DESK) } as const]),
  ];
}

export function startProgress(context: TimelineContext): Progress {
  return {
    desk: context.desk,
    at: AGENT_DESK,
    workerAt: WORKER_HOME,
    deniedTools: [],
    memory: context.memory ?? [],
    isSandboxRefused: false,
  };
}

/**
 * Transforme un tour de l'agent en animation, dans l'ordre exact des événements
 * d'une vraie session : message, appel d'outil, attente, résultat, fin de tour.
 */
export function buildTimeline(task: string, plan: readonly PlanStep[], context: TimelineContext): Timeline {
  const opening: Beat = {
    durationMs: Math.max(THINK_MS, travelMs(context.start, AGENT_DESK)),
    isModelRequest: true,
    effects: [
      { type: "status", status: "running" },
      { type: "entry", point: null },
      { type: "outcome", outcome: null },
      // Le message vient de ton application, sauf pour un déploiement planifié : là, c'est la plateforme qui l'envoie.
      event("user.message", task, context.entry === "cron" ? "session" : "app"),
      event("session.status_running", "l'agent réfléchit", "session"),
      ...wakeUp(context.start, context.entry),
    ],
  };

  const body = playPlan(plan, startProgress(context), context, (end) => closing(end.at, end.workerAt));
  const beats: Step[] = [
    ...(context.entry ? [alarm(context.entry, task, context.desk)] : []),
    opening,
    { durationMs: 0, effects: [NO_HOP] },
    ...body,
  ];
  return { beats, desk: approvedDesk(beats, context.desk) };
}

/** La boîte de support telle qu'elle sera à la fin du tour si tu donnes ton accord à chaque demande. */
export function approvedDesk(beats: readonly Step[], initial: Desk): Desk {
  const last = flatten(beats)
    .flatMap((beat) => beat.effects)
    .findLast((effect) => effect.type === "desk");
  return last?.type === "desk" ? last.desk : initial;
}
