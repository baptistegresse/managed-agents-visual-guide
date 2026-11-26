import type { GridPoint } from "@/lib/iso/projection";
import type { KeyId, ToolId } from "./catalog";
import {
  compact,
  createContext,
  markRequest,
  needsCompaction,
  openContext,
  recordInContext,
  type ContextSetup,
  type ContextWindow,
} from "./context";
import { createDesk, type Desk } from "./desk";
import { AGENT_HOME, WORKER_HOME } from "./layout";
import type {
  ApprovalRequest,
  Effect,
  EntryPoint,
  EventOrigin,
  HelperView,
  Hop,
  Mood,
  OutcomeView,
  SessionStatus,
  Spot,
  Verdict,
} from "./effects";

export const MAX_EVENT_LINES = 60;

export interface Actor {
  readonly position: GridPoint;
  /** Durée du déplacement en cours, pour la transition à l'écran. */
  readonly moveMs: number;
  readonly mood: Mood;
  readonly carrying: ToolId | null;
  readonly bubble: string | null;
}

/** Le code de ton application : c'est lui qui exécute les outils custom, pas l'agent. */
export interface Worker {
  readonly position: GridPoint;
  readonly moveMs: number;
  readonly carrying: ToolId | null;
}

export interface EventLine {
  readonly seq: number;
  readonly name: string;
  readonly detail: string;
  readonly origin: EventOrigin;
  readonly isError: boolean;
}

export interface ActiveKey {
  readonly key: KeyId;
  readonly isDenied: boolean;
}

/** Tout ce qui bouge pendant une session : l'agent, la boîte de support, le flux d'événements. */
export interface RunState {
  readonly status: SessionStatus;
  readonly desk: Desk;
  readonly actor: Actor;
  readonly worker: Worker;
  /** L'appel qui traverse en ce moment d'une zone à l'autre. */
  readonly hop: Hop | null;
  /** Ce que le modèle relit à chaque requête, et la configuration dont une session repart. */
  readonly context: ContextWindow;
  readonly contextSetup: ContextSetup | null;
  readonly activeKey: ActiveKey | null;
  /** Le point d'entrée qui sonne en ce moment, et le dernier à avoir servi. */
  readonly activeEntry: EntryPoint | null;
  readonly lastEntry: EntryPoint | null;
  readonly events: readonly EventLine[];
  readonly eventCount: number;
  /** Ce qu'affiche l'écran de l'établi pendant qu'un outil du bac à sable tourne. */
  readonly terminal: readonly string[] | null;
  /** Les fichiers que l'agent a écrits dans les sorties de la session. */
  readonly files: readonly string[];
  readonly approval: ApprovalRequest | null;
  /** Le carnet de mémoire : il survit d'une session à l'autre. */
  readonly memory: readonly string[];
  readonly isUsingMemory: boolean;
  readonly helpers: readonly HelperView[];
  readonly outcome: OutcomeView | null;
  /** L'endroit de la session qui s'anime : la bibliothèque de skills. */
  readonly activeSpot: Spot | null;
  /** Le jugement de la politique « auto » sur l'appel en cours. */
  readonly verdict: Verdict | null;
  /** Plafond de dépense de la session, en centimes ; `null` sans limite. */
  readonly budgetCents: number | null;
  readonly spentCents: number;
  /** Nombre de tours déjà lancés dans cette session. */
  readonly turnCount: number;
}

/** Ce qui change l'état sans faire partie d'une animation. */
export type RunCommand =
  | { readonly type: "reset" }
  | { readonly type: "newSession"; readonly budgetCents: number | null; readonly context?: ContextSetup | null }
  | { readonly type: "modelRequest" }
  | { readonly type: "budgetSet"; readonly cents: number | null }
  | { readonly type: "spend"; readonly cents: number }
  | { readonly type: "turnStarted" };

export function createRun(): RunState {
  return {
    status: "idle",
    desk: createDesk(),
    actor: { position: AGENT_HOME, moveMs: 0, mood: "idle", carrying: null, bubble: null },
    worker: { position: WORKER_HOME, moveMs: 0, carrying: null },
    hop: null,
    context: createContext(),
    contextSetup: null,
    activeKey: null,
    activeEntry: null,
    lastEntry: null,
    events: [],
    eventCount: 0,
    terminal: null,
    files: [],
    approval: null,
    memory: [],
    isUsingMemory: false,
    helpers: [],
    outcome: null,
    activeSpot: null,
    verdict: null,
    budgetCents: null,
    spentCents: 0,
    turnCount: 0,
  };
}

/** Une nouvelle session repart d'un conteneur et d'un contexte vides : seules la boîte de support et la mémoire restent. */
export function applyCommand(state: RunState, command: RunCommand): RunState {
  switch (command.type) {
    case "reset":
      return createRun();
    case "newSession": {
      const setup = command.context ?? null;
      return {
        ...createRun(),
        desk: state.desk,
        memory: state.memory,
        budgetCents: command.budgetCents,
        contextSetup: setup,
        context: setup ? openContext(setup) : createContext(),
      };
    }
    case "modelRequest":
      return { ...state, context: markRequest(state.context) };
    case "budgetSet":
      return { ...state, budgetCents: command.cents };
    case "spend":
      return { ...state, spentCents: state.spentCents + command.cents };
    case "turnStarted":
      return { ...state, turnCount: state.turnCount + 1 };
  }
}

type EventEffect = Extract<Effect, { type: "event" }>;

function withLine(state: RunState, effect: Omit<EventEffect, "type">): RunState {
  const line: EventLine = {
    seq: state.eventCount + 1,
    name: effect.name,
    detail: effect.detail,
    origin: effect.origin,
    isError: effect.isError ?? false,
  };
  return { ...state, events: [...state.events, line].slice(-MAX_EVENT_LINES), eventCount: state.eventCount + 1 };
}

/** L'événement rejoint le flux, et la fenêtre de contexte si le modèle le lit ; trop pleine, elle est compactée. */
function withEvent(state: RunState, effect: EventEffect): RunState {
  const context = recordInContext(state.context, effect);
  const logged = { ...withLine(state, effect), context };
  if (!needsCompaction(context)) return logged;
  const compacted = compact(context);
  if (compacted === context) return logged;
  return {
    ...withLine(logged, {
      name: "agent.thread_context_compacted",
      detail: "processed_at",
      origin: "session",
    }),
    context: compacted,
  };
}

export function applyEffect(state: RunState, effect: Effect): RunState {
  switch (effect.type) {
    case "event":
      return withEvent(state, effect);
    case "move":
      return effect.who === "worker"
        ? { ...state, worker: { ...state.worker, position: effect.to, moveMs: effect.durationMs } }
        : { ...state, actor: { ...state.actor, position: effect.to, moveMs: effect.durationMs } };
    case "mood":
      return { ...state, actor: { ...state.actor, mood: effect.mood } };
    case "carry":
      return effect.who === "worker"
        ? { ...state, worker: { ...state.worker, carrying: effect.tool } }
        : { ...state, actor: { ...state.actor, carrying: effect.tool } };
    case "hop":
      return { ...state, hop: effect.hop };
    case "freshSession":
      return { ...state, context: state.contextSetup ? openContext(state.contextSetup) : createContext() };
    case "bubble":
      return { ...state, actor: { ...state.actor, bubble: effect.text } };
    case "key":
      return { ...state, activeKey: effect.key ? { key: effect.key, isDenied: effect.isDenied } : null };
    case "desk":
      return { ...state, desk: effect.desk };
    case "status":
      return { ...state, status: effect.status };
    case "entry":
      return { ...state, activeEntry: effect.point, lastEntry: effect.point ?? state.lastEntry };
    case "terminal":
      return { ...state, terminal: effect.lines };
    case "file":
      return state.files.includes(effect.name) ? state : { ...state, files: [...state.files, effect.name] };
    case "approval":
      return { ...state, approval: effect.request };
    case "memory":
      return { ...state, memory: effect.notes };
    case "memoryUse":
      return { ...state, isUsingMemory: effect.isActive };
    case "helpers":
      return { ...state, helpers: effect.helpers };
    case "outcome":
      return { ...state, outcome: effect.outcome };
    case "spot":
      return { ...state, activeSpot: effect.spot };
    case "verdict":
      return { ...state, verdict: effect.verdict };
  }
}
