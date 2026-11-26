import type { GridPoint } from "@/lib/iso/projection";
import { hop, NO_HOP } from "./calls";
import { event, RESUMED, speech, type Beat, type Effect, type SandboxPolicy, type Step } from "./effects";
import { LIBRARY_STAND, travelMs, WORKBENCH_STAND } from "./layout";
import type { PlanStep } from "./planner";
import type { Continue, Progress } from "./progress";

const TYPE_MS = 900;
const READ_MS = 1100;
const MEMORY_MS = 1000;
const MEMORY_PATH = "/mnt/memory/notes.md";

const TERMINAL_PREFIX: Readonly<Record<"bash" | "write" | "read", string>> = { bash: "$", write: "✎", read: "◂" };
const VERDICT_MS = 700;

/** Un appel d'outil intégré : à l'établi ou à la bibliothèque dans le conteneur, ou sur les serveurs d'Anthropic pour le web. */
export interface BuiltinCall {
  readonly tool: string;
  readonly target: string;
  readonly output: string;
  readonly isError: boolean;
  readonly origin: "sandbox" | "web";
  /** Où l'agent va se placer dans la session ; sans objet pour un outil qui ne tourne pas dans le conteneur. */
  readonly stand?: GridPoint;
  /** Ce qui s'allume dans la scène pendant l'appel, puis s'éteint. */
  readonly show: (lines: readonly string[] | null) => Effect;
  readonly file?: string;
  readonly risk: "safe" | "high" | "unclear";
}

const CLEAR_VERDICT: Effect = { type: "verdict", verdict: null };

/**
 * Un outil intégré s'exécute côté Anthropic, sans passer par ton application.
 * Sa politique décide s'il part tout de suite, s'il attend ton accord, ou si la
 * plateforme tranche elle-même (« auto ») : sûr, risqué, ou à toi de décider.
 */
export function playBuiltin(
  call: BuiltinCall,
  progress: Progress,
  policy: SandboxPolicy,
  next: Continue,
  /** La fin du tour, si l'appel est refusé : l'agent abandonne le reste de ce qu'il avait prévu. */
  abandon: Continue,
): Step[] {
  if (progress.isSandboxRefused) return next(progress);
  const stand = call.stand ?? progress.at;
  const arrived: Progress = { ...progress, at: stand };
  const evaluated = policy === "auto" ? ` · évalué : ${call.risk === "safe" ? "allow" : call.risk === "high" ? "deny" : "ask"}` : "";

  const go: Beat = {
    durationMs: travelMs(progress.at, stand),
    effects: [
      { type: "bubble", text: null },
      event("agent.tool_use", `${call.tool} : ${call.target}${evaluated}`, "agent"),
      ...(call.stand
        ? ([
            { type: "mood", mood: "walking" },
            { type: "move", to: stand, durationMs: travelMs(progress.at, stand) },
          ] as const)
        : []),
    ],
  };
  const run: Beat[] = [
    { durationMs: TYPE_MS, effects: [CLEAR_VERDICT, { type: "mood", mood: "working" }, call.show([call.target])] },
    {
      durationMs: READ_MS,
      isModelRequest: true,
      effects: [
        call.show([call.target, call.output]),
        event("agent.tool_result", call.output, call.origin, call.isError),
        ...(call.file ? [{ type: "file", name: call.file } as const] : []),
      ],
    },
    { durationMs: 250, effects: [call.show(null), { type: "mood", mood: "thinking" }] },
  ];
  const gate: Step = {
    gate: "approval",
    ask: {
      durationMs: 0,
      effects: [
        event("session.status_idle", "requires_action : cet appel attend ton accord", "session"),
        { type: "approval", request: { tool: call.tool, target: call.target } },
        { type: "mood", mood: "waiting" },
      ],
    },
    allow: [
      {
        durationMs: 300,
        effects: [{ type: "approval", request: null }, event("user.tool_confirmation", "allow", "app"), RESUMED],
      },
      ...run,
      ...next(arrived),
    ],
    deny: [
      {
        durationMs: 300,
        isModelRequest: true,
        effects: [
          CLEAR_VERDICT,
          { type: "approval", request: null },
          event("user.tool_confirmation", "deny", "app"),
          event("agent.tool_result", "Permission refusée.", call.origin, true),
          RESUMED,
          { type: "mood", mood: "thinking" },
        ],
      },
      speech("Tu as refusé : je n'exécute pas cet appel."),
      ...abandon({ ...arrived, isSandboxRefused: true }),
    ],
  };

  if (policy === "always_ask") return [go, gate];
  if (policy !== "auto") return [go, ...run, ...next(arrived)];

  // « auto » : la plateforme évalue l'appel avant qu'il parte.
  if (call.risk === "safe") {
    return [
      go,
      { durationMs: VERDICT_MS, effects: [{ type: "verdict", verdict: { text: "auto : jugé sûr", tone: "ok" } }] },
      ...run,
      ...next(arrived),
    ];
  }
  if (call.risk === "unclear") {
    return [
      go,
      { durationMs: VERDICT_MS, effects: [{ type: "verdict", verdict: { text: "auto : pas de certitude", tone: "ask" } }] },
      gate,
    ];
  }
  return [
    go,
    {
      durationMs: VERDICT_MS * 2,
      isModelRequest: true,
      effects: [
        { type: "verdict", verdict: { text: "auto : refusé, trop risqué", tone: "danger" } },
        event("agent.tool_result", `Permission to use ${call.tool} has been denied.`, call.origin, true),
        { type: "mood", mood: "thinking" },
      ],
    },
    speech("La plateforme a refusé cet appel : elle le juge trop risqué, et personne ne peut passer outre."),
    { durationMs: 0, effects: [CLEAR_VERDICT] },
    ...abandon({ ...arrived, isSandboxRefused: true }),
  ];
}

/** bash et les outils de fichiers : à l'établi, ou devant la bibliothèque pour charger un skill. */
export function sandboxCall(step: Extract<PlanStep, { type: "sandbox" }>): BuiltinCall {
  const isLibrary = step.place === "library";
  const prefix = TERMINAL_PREFIX[step.tool];
  return {
    tool: step.tool,
    target: step.target,
    output: step.output,
    isError: false,
    origin: "sandbox",
    stand: isLibrary ? LIBRARY_STAND : WORKBENCH_STAND,
    // À l'établi, la commande s'affiche à l'écran ; devant la bibliothèque, c'est le skill qui s'éclaire.
    show: (lines) =>
      isLibrary
        ? { type: "spot", spot: lines ? "library" : null }
        : { type: "terminal", lines: lines ? [`${prefix} ${lines[0]}`, ...lines.slice(1)] : null },
    file: step.file,
    risk: step.risk ?? "safe",
  };
}

/** Les outils web tournent sur les serveurs d'Anthropic : l'agent ne bouge pas, l'appel part vers le web. */
export function webCall(step: Extract<PlanStep, { type: "web" }>): BuiltinCall {
  return {
    tool: step.tool,
    target: step.target,
    output: step.output,
    isError: step.isError,
    origin: "web",
    show: (lines) =>
      lines === null
        ? NO_HOP
        : lines.length === 1
          ? hop("agent", "web", step.tool, "call")
          : hop("web", "agent", step.isError ? "refusé" : "résultat", step.isError ? "error" : "result"),
    risk: "safe",
  };
}

/** La mémoire est un dossier monté dans le conteneur : l'agent la lit et l'écrit comme un fichier. */
export function playMemory(step: Extract<PlanStep, { type: "memory" }>, progress: Progress, next: Continue): Step[] {
  const notes = step.op === "write" ? [...progress.memory.filter((note) => note !== step.note), step.note] : progress.memory;
  const result = step.op === "write" ? `Note enregistrée : ${step.note}` : notes.join(" ; ") || "(aucune note)";
  return [
    {
      durationMs: MEMORY_MS,
      effects: [
        { type: "bubble", text: null },
        event("agent.tool_use", `${step.op} : ${MEMORY_PATH}`, "agent"),
        { type: "memoryUse", isActive: true },
        { type: "mood", mood: "working" },
      ],
    },
    {
      durationMs: 300,
      isModelRequest: true,
      effects: [
        event("agent.tool_result", result, "sandbox"),
        { type: "memory", notes },
        { type: "memoryUse", isActive: false },
        { type: "mood", mood: "thinking" },
      ],
    },
    ...next({ ...progress, memory: notes }),
  ];
}
