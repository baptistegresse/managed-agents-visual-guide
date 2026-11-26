import type { Effect } from "@/lib/workshop/effects";
import { applyCommand, applyEffect, createRun, type RunCommand, type RunState } from "@/lib/workshop/run";
import type { Lesson, Piece, SceneChange, SceneFacts, StepAction } from "./types";

/** Ce que montre l'écran à une étape donnée : l'état de la session, les pièces posées, et ce qui est vrai. */
export interface LessonView {
  readonly run: RunState;
  readonly pieces: ReadonlySet<Piece>;
  readonly facts: SceneFacts;
}

const INITIAL_FACTS: SceneFacts = { vaultKeys: [], networking: "limited", hasMountedFile: false, agentVersion: 1 };

/** Ce qui ne dure que le temps d'une étape : un appel en vol, une clé sortie du vault, un écran allumé. */
const TRANSIENT: readonly Effect[] = [
  { type: "hop", hop: null },
  { type: "key", key: null, isDenied: false },
  { type: "terminal", lines: null },
  { type: "verdict", verdict: null },
  { type: "entry", point: null },
  { type: "spot", spot: null },
  { type: "memoryUse", isActive: false },
];

const COMMANDS: ReadonlySet<string> = new Set<RunCommand["type"]>([
  "reset",
  "newSession",
  "budgetSet",
  "spend",
  "turnStarted",
  "modelRequest",
]);

function isCommand(action: StepAction): action is RunCommand {
  return COMMANDS.has(action.type);
}

function apply(state: RunState, action: StepAction): RunState {
  return isCommand(action) ? applyCommand(state, action) : applyEffect(state, action);
}

export function stepCount(lesson: Lesson): number {
  return lesson.steps.length;
}

/**
 * Rejoue la leçon depuis le début jusqu'à l'étape demandée. Comme rien n'est
 * gardé d'un appel à l'autre, revenir en arrière redonne exactement l'écran
 * d'avant.
 */
export function lessonView(lesson: Lesson, index: number): LessonView {
  const last = Math.min(lesson.steps.length - 1, Math.max(0, index));
  const changes: readonly SceneChange[] = [lesson.before ?? {}, ...lesson.steps.slice(0, last + 1)];
  // Ce que les chapitres précédents ont laissé est posé tel quel ; chaque étape, elle, repart sans rien en vol.
  const actionsOf = (change: SceneChange, position: number): readonly StepAction[] =>
    position === 0 ? (change.actions ?? []) : [...TRANSIENT, ...(change.actions ?? [])];
  return {
    run: changes.reduce((state, change, position) => actionsOf(change, position).reduce(apply, state), createRun()),
    pieces: new Set(changes.flatMap((change) => change.adds ?? [])),
    facts: changes.reduce<SceneFacts>((facts, change) => ({ ...facts, ...change.sets }), INITIAL_FACTS),
  };
}
