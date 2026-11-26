import type { GridPoint } from "@/lib/iso/projection";
import { toolSpec, type KeyId } from "./catalog";
import { event, speech, type Beat, type Effect, type HelperView } from "./effects";
import { ticketStand } from "./calls";
import { applyTool, type Desk } from "./desk";
import { BRIDGE_MIDDLE, rackStand, travelMs, WORKER_HOME } from "./layout";
import type { PlanStep } from "./planner";

/** En dessous de ce nombre d'appels, déléguer ne vaut pas le coup. */
export const TEAM_MIN_CALLS = 3;
const TEAM_SIZE = 2;
const SPAWN_MS = 600;
const PICK_MS = 380;
const WORK_MS = 420;
const SETTLE_MS = 450;
const SPAWN_OFFSET = 0.9;
/** Écart entre deux exécutants qui traversent la passerelle de front. */
const BRIDGE_LANE = 0.4;

type Call = Extract<PlanStep, { type: "call" }>;

export interface TeamRun {
  readonly beats: readonly Beat[];
  readonly desk: Desk;
}

/** Un appel peut être confié à une copie si c'est un outil custom qui agit sur un ticket de la planche. */
export function isDelegable(step: PlanStep): step is Call {
  if (step.type !== "call") return false;
  const spec = toolSpec(step.tool);
  return spec.requiresKey === null && spec.target === "desk";
}

function label(id: number): string {
  return `copie ${id}`;
}

interface Job {
  readonly id: number;
  readonly call: Call;
}

/** Les exécutants des jobs se rendent chacun à leur destination ; les autres ne bougent pas. */
function walkTo(helpers: readonly HelperView[], jobs: readonly Job[], destination: (job: Job) => GridPoint): HelperView[] {
  return helpers.map((helper) => {
    const job = jobs.find((each) => each.id === helper.id);
    if (!job) return { ...helper, moveMs: 0 };
    const to = destination(job);
    return { ...helper, position: to, moveMs: travelMs(helper.position, to) };
  });
}

function holding(helpers: readonly HelperView[], jobs: readonly Job[], isCarrying: boolean): HelperView[] {
  return helpers.map((helper) => {
    const job = jobs.find((each) => each.id === helper.id);
    return job ? { ...helper, carrying: isCarrying ? job.call.tool : null, moveMs: 0 } : helper;
  });
}

function slowest(helpers: readonly HelperView[]): number {
  return Math.max(0, ...helpers.map((helper) => helper.moveMs));
}

function onBridge(job: Job): GridPoint {
  return { x: BRIDGE_MIDDLE.x, y: BRIDGE_MIDDLE.y + (job.id - (TEAM_SIZE + 1) / 2) * BRIDGE_LANE };
}

interface Round {
  readonly beats: readonly Beat[];
  readonly helpers: readonly HelperView[];
  readonly desk: Desk;
}

/** Un tour de la série : chaque copie émet un appel, et ton application les exécute en même temps. */
function playRound(state: Round, jobs: readonly Job[], isFirst: boolean, keys: readonly KeyId[]): Round {
  const back = isFirst ? state.helpers : walkTo(state.helpers, jobs, onBridge);
  const atRack = walkTo(back, jobs, ({ call }) => rackStand(call.tool));
  const loaded = holding(atRack, jobs, true);
  const crossing = walkTo(loaded, jobs, onBridge);
  const atTile = walkTo(crossing, jobs, ({ call }) => ticketStand(state.desk, call.input));
  const done = holding(atTile, jobs, false);

  const applied = jobs.reduce<{ desk: Desk; results: Effect[] }>(
    (result, { id, call }) => {
      const outcome = applyTool(result.desk, call, keys);
      return {
        desk: outcome.desk,
        results: [
          ...result.results,
          event("user.custom_tool_result", `[${label(id)}] ${outcome.result.text}`, "app", outcome.result.isError),
        ],
      };
    },
    { desk: state.desk, results: [] },
  );

  const beats: Beat[] = [
    ...(isFirst ? [] : [{ durationMs: slowest(back), effects: [{ type: "helpers", helpers: back } as const] }]),
    {
      durationMs: slowest(atRack),
      effects: [
        ...jobs.map(({ id, call }) =>
          event("agent.custom_tool_use", `[${label(id)}] ${call.tool}(${JSON.stringify(call.input)})`, "agent"),
        ),
        { type: "helpers", helpers: atRack },
      ],
    },
    { durationMs: PICK_MS, effects: [{ type: "helpers", helpers: loaded }] },
    { durationMs: slowest(crossing), effects: [{ type: "helpers", helpers: crossing }] },
    { durationMs: slowest(atTile), effects: [{ type: "helpers", helpers: atTile }] },
    { durationMs: WORK_MS, effects: [] },
    {
      durationMs: SETTLE_MS,
      isModelRequest: true,
      effects: [{ type: "desk", desk: applied.desk }, ...applied.results, { type: "helpers", helpers: done }],
    },
  ];
  return { beats: [...state.beats, ...beats], helpers: done, desk: applied.desk };
}

/**
 * L'agent confie une série d'appels à des copies de lui-même : chacune a son
 * propre fil et sa propre fenêtre de contexte. Leurs appels d'outils custom
 * arrivent tous à ton application, qui les exécute en parallèle : les
 * `helpers` sont ces exécutants-là, un par copie.
 */
export function playTeam(steps: readonly PlanStep[], desk: Desk, keys: readonly KeyId[]): TeamRun {
  const calls = steps.filter(isDelegable);
  const ids = Array.from({ length: TEAM_SIZE }, (_, index) => index + 1);
  const spawned: HelperView[] = ids.map((id) => ({
    id,
    position: { x: WORKER_HOME.x + SPAWN_OFFSET * id, y: WORKER_HOME.y + SPAWN_OFFSET / 2 },
    moveMs: 0,
    carrying: null,
  }));
  const rounds = Math.ceil(calls.length / TEAM_SIZE);

  const intro: Beat[] = [
    speech("C'est un gros travail : je le partage entre deux copies de moi-même."),
    {
      durationMs: SPAWN_MS,
      effects: [
        { type: "bubble", text: null },
        ...ids.map((id) => event("session.thread_created", `${label(id)} : un fil et un contexte rien qu'à elle`, "session")),
        { type: "helpers", helpers: spawned },
        { type: "mood", mood: "waiting" },
      ],
    },
  ];

  const played = Array.from({ length: rounds }, (_, round) => round).reduce<Round>(
    (state, round) => {
      const jobs = ids.flatMap((id) => {
        const call = calls[round * TEAM_SIZE + (id - 1)];
        return call ? [{ id, call }] : [];
      });
      return playRound(state, jobs, round === 0, keys);
    },
    { beats: [], helpers: spawned, desk },
  );

  const outro: Beat[] = [
    {
      durationMs: SPAWN_MS,
      isModelRequest: true,
      effects: [
        ...ids.map((id) => event("session.thread_status_idle", `${label(id)} a terminé et rend compte`, "session")),
        { type: "helpers", helpers: [] },
        { type: "mood", mood: "thinking" },
      ],
    },
    speech("Mes copies ont terminé."),
  ];

  return { beats: [...intro, ...played.beats, ...outro], desk: played.desk };
}
