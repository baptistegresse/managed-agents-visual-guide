"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { contextSetupFor } from "@/lib/workshop/context";
import { createJourney, recordEvent, type Journey } from "@/lib/workshop/journey";
import { buildOutcomeTimeline, DEFAULT_GOAL } from "@/lib/workshop/outcome";
import { planTurn } from "@/lib/workshop/planner";
import { reactTo, type Trigger } from "@/lib/workshop/reaction";
import { applyCommand, applyEffect, createRun, type RunCommand, type RunState } from "@/lib/workshop/run";
import { agentConfig, type WorkshopState } from "@/lib/workshop/state";
import {
  buildTimeline,
  closing,
  event,
  isGate,
  RESUMED,
  type Beat,
  type Effect,
  type Step,
  type Timeline,
} from "@/lib/workshop/timeline";

type RunAction = Effect | RunCommand;
type Decision = "allow" | "deny";
/** Une panne à provoquer : passagère (la plateforme réessaie) ou définitive (la session s'arrête). */
export type Fault = "transient" | "fatal";

export interface AgentRun {
  readonly run: RunState;
  /** Ce que l'apprenant a déjà vu se produire : il sert au parcours guidé, et survit aux sessions. */
  readonly journey: Journey;
  /** Déclenchements arrivés pendant que l'agent travaillait : ils attendent leur tour. */
  readonly queuedCount: number;
  readonly isWebhookOn: boolean;
  readonly isCronOn: boolean;
  readonly sendTask: (task: string) => void;
  readonly trigger: (trigger: Trigger) => void;
  readonly defineOutcome: () => void;
  readonly decideApproval: (decision: Decision) => void;
  readonly raiseBudget: (cents: number) => void;
  readonly interrupt: () => void;
  /** Ajoute une ligne au flux d'événements pour une action faite hors de la session. */
  readonly logEvent: (name: string, detail: string) => void;
  /** La panne qui frappera le prochain appel au modèle, s'il y en a une d'armée. */
  readonly armedFault: Fault | null;
  readonly armFault: (fault: Fault) => void;
  readonly startSession: (budgetCents: number | null) => void;
  /** Ferme la session en cours : tout s'arrête, la boîte de support et la mémoire restent. */
  readonly endSession: () => void;
  readonly setWebhookOn: (isOn: boolean) => void;
  readonly setCronOn: (isOn: boolean) => void;
  readonly resetRun: () => void;
}

const MAX_QUEUE = 4;
export const CRON_INTERVAL_MS = 20_000;
export const WEBHOOK_MIN_DELAY_MS = 8_000;
export const WEBHOOK_MAX_DELAY_MS = 16_000;
/** Coût simulé d'un appel au modèle, volontairement grossi pour que la jauge bouge. */
export const COST_PER_REQUEST_CENTS = 1;

const RESCHEDULE_MS = 2600;

const COMMANDS: ReadonlySet<string> = new Set(["reset", "newSession", "budgetSet", "spend", "turnStarted", "modelRequest"]);

function isCommand(action: RunAction): action is RunCommand {
  return COMMANDS.has(action.type);
}

function runReducer(state: RunState, action: RunAction): RunState {
  return isCommand(action) ? applyCommand(state, action) : applyEffect(state, action);
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

/** Remet l'écran au propre quand un tour est coupé net. */
const CLEARED: readonly Effect[] = [
  { type: "approval", request: null },
  { type: "terminal", lines: null },
  { type: "helpers", helpers: [] },
  { type: "key", key: null, isDenied: false },
  { type: "carry", tool: null },
  { type: "carry", who: "worker", tool: null },
  { type: "hop", hop: null },
  { type: "bubble", text: null },
  { type: "memoryUse", isActive: false },
  { type: "entry", point: null },
  { type: "spot", spot: null },
  { type: "verdict", verdict: null },
];

/**
 * Fait vivre la session simulée : une consigne ou un point d'entrée devient une
 * suite de temps d'animation, joués un par un. La session s'arrête d'elle-même
 * quand un appel attend ton accord ou quand le budget est atteint, et ce qui
 * arrive pendant ce temps est mis en file, comme dans une vraie session.
 */
export function useAgentRun(workshop: WorkshopState): AgentRun {
  const [run, dispatch] = useReducer(runReducer, undefined, createRun);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isWebhookOn, setWebhookOn] = useState(false);
  const [isCronOn, setCronOn] = useState(false);
  const [journey, setJourney] = useState<Journey>(createJourney);

  /** L'état de référence, tenu à jour à chaque effet sans attendre le rendu. */
  const state = useRef<RunState>(createRun());
  const queue = useRef<readonly Trigger[]>([]);
  const isPlaying = useRef(false);
  /** Change à chaque tour ou remise à zéro : un tour périmé s'arrête de lui-même. */
  const generation = useRef(0);
  const latestWorkshop = useRef(workshop);
  const answerApproval = useRef<((decision: Decision) => void) | null>(null);
  const resumeBudget = useRef<(() => void) | null>(null);
  const pendingFault = useRef<Fault | null>(null);
  const [armedFault, setArmedFault] = useState<Fault | null>(null);

  useEffect(() => {
    latestWorkshop.current = workshop;
  }, [workshop]);

  const apply = (action: RunAction): void => {
    state.current = runReducer(state.current, action);
    dispatch(action);
    if (action.type !== "event") return;
    const line = { name: action.name, detail: action.detail, origin: action.origin, isError: action.isError ?? false };
    setJourney((previous) => recordEvent(previous, line));
  };

  const setQueue = (next: readonly Trigger[]): void => {
    queue.current = next;
    setQueuedCount(next.length);
  };

  const applyBeat = (beat: Beat): void => {
    for (const effect of beat.effects) apply(effect);
  };

  /**
   * Une panne armée frappe l'appel au modèle : passagère, la plateforme replanifie
   * la session et reprend ; définitive, la session se termine. Renvoie false si elle est terminée.
   */
  const passFault = async (mine: number): Promise<boolean> => {
    const fault = pendingFault.current;
    if (!fault) return true;
    pendingFault.current = null;
    setArmedFault(null);
    if (fault === "transient") {
      apply(event("session.error", "model_overloaded_error : modèle surchargé, nouvel essai", "session", true));
      apply(event("session.status_rescheduled", "la plateforme replanifie la session", "session"));
      apply({ type: "status", status: "rescheduling" });
      apply({ type: "mood", mood: "stunned" });
      await wait(RESCHEDULE_MS);
      // Entre-temps le tour a pu être interrompu ou la session remplacée : ce tour-là ne reprend pas.
      if (generation.current !== mine) return false;
      apply({ type: "status", status: "running" });
      apply(RESUMED);
      apply({ type: "mood", mood: "thinking" });
      return true;
    }
    for (const effect of CLEARED) apply(effect);
    apply(event("session.error", "model_request_failed_error : la requête au modèle a échoué", "session", true));
    apply(event("session.status_terminated", "la session est terminée, elle ne reprendra pas", "session", true));
    apply({ type: "status", status: "terminated" });
    apply({ type: "mood", mood: "off" });
    generation.current += 1;
    isPlaying.current = false;
    setQueue([]);
    setWebhookOn(false);
    setCronOn(false);
    return false;
  };

  /** Avant chaque appel au modèle, la plateforme vérifie le budget : atteint, la session se met en pause. */
  const passBudgetGate = async (mine: number): Promise<void> => {
    const { budgetCents, spentCents } = state.current;
    if (budgetCents !== null && spentCents >= budgetCents) {
      apply(event("session.status_idle", "budget_reached : la session est en pause", "session", true));
      apply({ type: "status", status: "paused_budget" });
      await new Promise<void>((resolve) => {
        resumeBudget.current = resolve;
      });
      resumeBudget.current = null;
      if (generation.current !== mine) return;
      apply({ type: "status", status: "running" });
      apply(RESUMED);
    }
    if (generation.current !== mine) return;
    apply({ type: "spend", cents: COST_PER_REQUEST_CENTS });
  };

  const playSteps = async (steps: readonly Step[], mine: number): Promise<boolean> => {
    for (const step of steps) {
      if (generation.current !== mine) return false;
      if (isGate(step)) {
        applyBeat(step.ask);
        apply({ type: "status", status: "waiting_approval" });
        const decision = await new Promise<Decision>((resolve) => {
          answerApproval.current = resolve;
        });
        answerApproval.current = null;
        if (generation.current !== mine) return false;
        apply({ type: "status", status: "running" });
        if (!(await playSteps(decision === "allow" ? step.allow : step.deny, mine))) return false;
        continue;
      }
      if (step.isModelRequest) {
        if (!(await passFault(mine))) return false;
        if (generation.current !== mine) return false;
        await passBudgetGate(mine);
        if (generation.current !== mine) return false;
      }
      applyBeat(step);
      // Le modèle est sans mémoire : chaque requête lui renvoie toute la fenêtre de contexte.
      if (step.isModelRequest) apply({ type: "modelRequest" });
      await wait(step.durationMs);
    }
    return generation.current === mine;
  };

  const play = async (timeline: Timeline): Promise<void> => {
    generation.current += 1;
    const mine = generation.current;
    isPlaying.current = true;
    if (!(await playSteps(timeline.beats, mine))) return;
    isPlaying.current = false;
    drain();
  };

  // La session travaille avec la version d'agent sur laquelle elle a démarré, pas avec la dernière.
  const settings = () => {
    const config = latestWorkshop.current.session.config ?? agentConfig(latestWorkshop.current);
    return {
      enabledTools: config.enabledTools,
      keys: latestWorkshop.current.vault.keys,
      sandbox: config.sandbox,
      canDelegate: config.canDelegate,
      hasSkill: config.hasSkill,
      hasWeb: config.hasWeb,
      start: state.current.actor.position,
      desk: state.current.desk,
    };
  };

  /** Les notes du carnet, si cette session en a un : elles donnent le ton des réponses. */
  const notebook = (): readonly string[] | null =>
    latestWorkshop.current.session.hasMemory ? state.current.memory : null;

  const react = (next: Trigger): boolean => {
    const timeline = reactTo(next, {
      ...settings(),
      random: Math.random,
      memory: notebook(),
      isFirstTurn: state.current.turnCount === 0,
    });
    if (!timeline) return false;
    apply({ type: "turnStarted" });
    void play(timeline);
    return true;
  };

  /** Passe au déclenchement suivant ; ceux qui ne peuvent plus se produire sont écartés. */
  function drain(): void {
    while (queue.current.length > 0) {
      const [next, ...rest] = queue.current;
      setQueue(rest);
      if (react(next)) return;
    }
  }

  const isOver = (): boolean => state.current.status === "terminated";

  const armFault = (fault: Fault): void => {
    if (isOver()) return;
    pendingFault.current = fault;
    setArmedFault(fault);
  };

  const trigger = (next: Trigger): void => {
    if (!latestWorkshop.current.session.id || isOver()) return;
    if (!isPlaying.current) {
      react(next);
      return;
    }
    const isDuplicateRound = next.kind === "round" && queue.current.some((queued) => queued.kind === "round");
    if (queue.current.length >= MAX_QUEUE || isDuplicateRound) return;
    setQueue([...queue.current, next]);
  };

  const sendTask = (task: string): void => {
    if (isPlaying.current || isOver()) return;
    const { enabledTools, keys, sandbox, canDelegate, hasSkill, hasWeb, start, desk } = settings();
    const memory = notebook();
    const plan = planTurn(task, {
      enabledTools,
      desk,
      random: Math.random,
      hasSandbox: sandbox !== "off",
      memory,
      isFirstTurn: state.current.turnCount === 0,
      hasSkill,
      hasPlan: latestWorkshop.current.session.hasPlan,
      hasWeb,
      isNetworkOpen: latestWorkshop.current.environment.networking === "unrestricted",
    });
    apply({ type: "turnStarted" });
    void play(
      buildTimeline(task, plan, { desk, keys, start, entry: "api", sandbox, canDelegate, memory: memory ?? [] }),
    );
  };

  const defineOutcome = (): void => {
    if (isPlaying.current || isOver()) return;
    const { enabledTools, keys, canDelegate, start, desk } = settings();
    apply({ type: "turnStarted" });
    void play(buildOutcomeTimeline(DEFAULT_GOAL, { desk, enabledTools, keys, start, canDelegate, random: Math.random }));
  };

  const decideApproval = (decision: Decision): void => {
    answerApproval.current?.(decision);
  };

  /** Relever le budget au-dessus de ce qui est déjà dépensé relance la session en pause. */
  const raiseBudget = (cents: number): void => {
    apply({ type: "budgetSet", cents: state.current.spentCents + cents });
    apply(event("session.updated", `budget relevé de ${cents} ¢`, "app"));
    resumeBudget.current?.();
  };

  /** Coupe le tour en cours : l'agent s'arrête net et retourne se coucher. */
  const interrupt = (): void => {
    if (!isPlaying.current) return;
    void play({
      beats: [
        { durationMs: 300, effects: [...CLEARED, event("user.interrupt", "tu arrêtes l'agent", "app"), { type: "mood", mood: "thinking" }] },
        ...closing(state.current.actor.position, state.current.worker.position),
      ],
      desk: state.current.desk,
    });
  };

  const logEvent = (name: string, detail: string): void => {
    apply(event(name, detail, "app"));
  };

  const stopEverything = (): void => {
    generation.current += 1;
    isPlaying.current = false;
    setQueue([]);
    setWebhookOn(false);
    setCronOn(false);
    pendingFault.current = null;
    setArmedFault(null);
  };

  const startSession = (budgetCents: number | null): void => {
    stopEverything();
    // La session épingle la dernière version de l'agent : c'est elle qui est écrite dans le contexte.
    const context = contextSetupFor(latestWorkshop.current.agent.system, agentConfig(latestWorkshop.current));
    apply({ type: "newSession", budgetCents, context });
  };

  const endSession = (): void => {
    stopEverything();
    apply({ type: "newSession", budgetCents: null });
  };

  const resetRun = (): void => {
    stopEverything();
    apply({ type: "reset" });
  };

  /** Les minuteries appellent toujours la version la plus récente de `trigger`. */
  const latestTrigger = useRef(trigger);
  useEffect(() => {
    latestTrigger.current = trigger;
  });

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  // Webhook : un client écrit à un moment quelconque, et la boîte de support le signale.
  useEffect(() => {
    if (!isWebhookOn) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = (): void => {
      const delay = WEBHOOK_MIN_DELAY_MS + Math.random() * (WEBHOOK_MAX_DELAY_MS - WEBHOOK_MIN_DELAY_MS);
      timer = setTimeout(() => {
        latestTrigger.current({ entry: "webhook", kind: "random" });
        arm();
      }, delay);
    };
    arm();
    return () => clearTimeout(timer);
  }, [isWebhookOn]);

  // Cron : une ronde à intervalle fixe.
  useEffect(() => {
    if (!isCronOn) return;
    const timer = setInterval(() => latestTrigger.current({ entry: "cron", kind: "round" }), CRON_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isCronOn]);

  return {
    run,
    journey,
    queuedCount,
    isWebhookOn,
    isCronOn,
    sendTask,
    trigger,
    defineOutcome,
    decideApproval,
    raiseBudget,
    interrupt,
    logEvent,
    armedFault,
    armFault,
    startSession,
    endSession,
    setWebhookOn,
    setCronOn,
    resetRun,
  };
}
