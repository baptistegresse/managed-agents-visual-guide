import type { GridPoint } from "@/lib/iso/projection";
import { NO_HOP } from "./calls";
import type { KeyId, ToolId } from "./catalog";
import { createDesk, INCIDENT_KINDS, openTickets, type Desk, type TicketKind } from "./desk";
import { handleTickets } from "./handling";
import type { PlanStep } from "./planner";
import {
  alarm,
  approvedDesk,
  closing,
  event,
  playPlan,
  speech,
  startProgress,
  wakeUp,
  type Beat,
  type Criterion,
  type OutcomeResult,
  type OutcomeView,
  type Progress,
  type Step,
  type Timeline,
} from "./timeline";

/** Ce qui doit avoir quitté la file pour que l'objectif soit atteint : les types de tickets à traiter. */
export interface Goal {
  readonly kinds: readonly TicketKind[];
}

export const DEFAULT_GOAL: Goal = { kinds: INCIDENT_KINDS };
export const MAX_ITERATIONS = 3;
/** L'agent simulé avance par petits jets : c'est ce qui laisse du travail au correcteur. */
export const CALLS_PER_ITERATION = 3;
const GRADING_MS = 1500;
const VERDICT_MS = 1100;
const OPENING_MS = 900;

export interface OutcomeInput {
  readonly desk: Desk;
  readonly enabledTools: readonly ToolId[];
  readonly keys: readonly KeyId[];
  readonly start: GridPoint;
  readonly random: () => number;
  readonly canDelegate: boolean;
}

const CRITERIA: Readonly<Record<TicketKind, string>> = {
  question: "Aucune question sans réponse",
  delivery: "Aucun colis en attente",
  refund: "Aucune demande de remboursement en attente",
  spam: "Aucun message indésirable",
};

export function goalDescription(goal: Goal): string {
  const isEverything = INCIDENT_KINDS.every((kind) => goal.kinds.includes(kind));
  if (isEverything) return "Une file vide : plus aucun ticket ouvert.";
  return `Une file allégée : ${goal.kinds.map((kind) => CRITERIA[kind].toLowerCase()).join(", ")}.`;
}

/** Le barème : des critères précis, que le correcteur vérifie un par un. */
export function grade(goal: Goal, desk: Desk): Criterion[] {
  const open = openTickets(desk);
  return goal.kinds.map((kind) => ({ text: CRITERIA[kind], isMet: !open.some((ticket) => ticket.kind === kind) }));
}

export function rubricText(goal: Goal): string {
  return grade(goal, createDesk())
    .map((criterion) => `- ${criterion.text}`)
    .join("\n");
}

/** Garde le plan jusqu'à son énième appel d'outil : le reste attendra le jet suivant. */
function firstCalls(plan: readonly PlanStep[], limit: number): PlanStep[] {
  const calls = plan.flatMap((step, index) => (step.type === "call" ? [index] : []));
  if (calls.length <= limit) return [...plan];
  return plan.slice(0, calls[limit - 1] + 1);
}

/** Ce qu'il reste à faire pour atteindre l'objectif, avec les outils disponibles. */
function gapPlan(goal: Goal, input: OutcomeInput, desk: Desk): PlanStep[] {
  const waiting = openTickets(desk).filter((ticket) => goal.kinds.includes(ticket.kind));
  if (waiting.length === 0) return [];
  // L'intro « N tickets en attente » laisse la place à celle du jet.
  const [, ...work] = handleTickets(waiting, { enabledTools: input.enabledTools });
  return firstCalls(work, CALLS_PER_ITERATION);
}

function view(goal: Goal, desk: Desk, iteration: number, phase: OutcomeView["phase"]): OutcomeView {
  return {
    description: goalDescription(goal),
    criteria: grade(goal, desk),
    iteration,
    maxIterations: MAX_ITERATIONS,
    phase,
  };
}

function verdictOf(unmetCount: number, iteration: number): OutcomeResult {
  if (unmetCount === 0) return "satisfied";
  return iteration === MAX_ITERATIONS - 1 ? "max_iterations_reached" : "needs_revision";
}

/** Le correcteur, séparé de l'agent, note le résultat critère par critère. */
function grading(goal: Goal, desk: Desk, iteration: number): Beat[] {
  const unmet = grade(goal, desk)
    .filter((criterion) => !criterion.isMet)
    .map((criterion) => criterion.text);
  const result = verdictOf(unmet.length, iteration);
  return [
    {
      durationMs: GRADING_MS,
      effects: [
        { type: "bubble", text: null },
        { type: "mood", mood: "waiting" },
        event("span.outcome_evaluation_start", `itération ${iteration + 1} sur ${MAX_ITERATIONS}`, "grader"),
        { type: "outcome", outcome: view(goal, desk, iteration, "grading") },
      ],
    },
    {
      durationMs: VERDICT_MS,
      isModelRequest: true,
      effects: [
        event(
          "span.outcome_evaluation_end",
          unmet.length === 0 ? `${result} : tous les critères sont remplis` : `${result} : il manque ${unmet.join(", ")}`,
          "grader",
          result === "max_iterations_reached",
        ),
        { type: "outcome", outcome: view(goal, desk, iteration, result) },
        { type: "mood", mood: "thinking" },
      ],
    },
  ];
}

/**
 * Une session avec objectif : l'agent travaille, un correcteur séparé note le
 * résultat critère par critère, et l'agent recommence tant que ce n'est pas bon.
 */
export function buildOutcomeTimeline(goal: Goal, input: OutcomeInput): Timeline {
  const context = { desk: input.desk, keys: input.keys, start: input.start, canDelegate: input.canDelegate };

  /** Un jet de travail, puis sa correction ; la suite dépend de l'état où le jet laisse la file. */
  const iterate = (iteration: number, from: Progress): Step[] => {
    const intro = iteration === 0 ? "Objectif reçu. Je fais un premier jet." : "Je reprends ce que le correcteur a relevé.";
    const plan: PlanStep[] = [{ type: "say", text: intro }, ...gapPlan(goal, input, from.desk)];
    return playPlan(plan, from, context, (end) => {
      const unmetCount = grade(goal, end.desk).filter((criterion) => !criterion.isMet).length;
      const result = verdictOf(unmetCount, iteration);
      if (result === "needs_revision") return [...grading(goal, end.desk, iteration), ...iterate(iteration + 1, end)];
      const verdict =
        result === "satisfied"
          ? "Le correcteur valide : objectif atteint."
          : "Le correcteur s'arrête là : je n'y arrive pas avec ce que j'ai.";
      return [...grading(goal, end.desk, iteration), speech(verdict), ...closing(end.at, end.workerAt)];
    });
  };

  const description = goalDescription(goal);
  const opening: Beat = {
    durationMs: OPENING_MS,
    isModelRequest: true,
    effects: [
      { type: "status", status: "running" },
      { type: "entry", point: null },
      event("user.define_outcome", description, "app"),
      event("session.status_running", "l'agent travaille vers l'objectif", "session"),
      { type: "outcome", outcome: view(goal, input.desk, 0, "working") },
      ...wakeUp(input.start, "api", "user.define_outcome"),
    ],
  };
  const beats: Step[] = [
    alarm("api", description, input.desk),
    opening,
    { durationMs: 0, effects: [NO_HOP] },
    ...iterate(0, startProgress(context)),
  ];
  return { beats, desk: approvedDesk(beats, input.desk) };
}
