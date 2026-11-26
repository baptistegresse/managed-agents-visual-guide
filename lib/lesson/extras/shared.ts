import type { ContextSetup } from "@/lib/workshop/context";
import { event, type Effect, type Place } from "@/lib/workshop/effects";
import { AGENT_DESK, AGENT_HOME } from "@/lib/workshop/layout";
import { AGENT_SETUP, BACKEND_FILE, SESSION_LESSON, WALK_MS } from "../base/session";
import { hop, type CodeBlock, type LessonStep, type Piece, type StepAction } from "../types";

export { WALK_MS };

/** Ce que la leçon principale a déjà posé : chaque chapitre repart de là. */
export const SCENE_PIECES: readonly Piece[] = ["agent", "room", "bench", "vault", "bed", "context"];

/** Les deux fichiers de la leçon principale, que les chapitres complètent. */
export const SETUP = "setup.ts";
export const ROUTE = BACKEND_FILE.name;

export interface SessionOptions {
  /** Les consignes de l'agent, quand le chapitre les change. */
  readonly system?: string;
  /** Les définitions d'outils que le chapitre ajoute à celle de « reply_ticket ». */
  readonly extraToolLines?: readonly string[];
  readonly budgetCents?: number | null;
}

/** Ce que la session écrit dans la pile à l'ouverture : la configuration de l'agent du chapitre. */
export function contextSetup({ system, extraToolLines = [] }: SessionOptions = {}): ContextSetup {
  return {
    system: system ?? AGENT_SETUP.system,
    toolLines: [...AGENT_SETUP.toolLines, ...extraToolLines],
  };
}

/** Ton backend ouvre une session : la pile ne contient que la configuration de l'agent. */
export function openSession(options: SessionOptions = {}): StepAction {
  return { type: "newSession", budgetCents: options.budgetCents ?? null, context: contextSetup(options) };
}

interface OpeningStep extends LessonStep {
  readonly session?: SessionOptions;
}

/**
 * La première étape d'un chapitre : elle remet la scène là où la leçon
 * principale l'a laissée (les pièces posées, une session ouverte, l'agent au
 * lit), puis joue ce que le chapitre y ajoute.
 */
export function openingStep({ session, adds = [], actions = [], ...step }: OpeningStep): LessonStep {
  return { ...step, adds: [...SCENE_PIECES, ...adds], actions: [openSession(session), ...actions] };
}

/** Le tour de la leçon principale, tel que le flux l'a vu passer : il remplit la pile d'une session déjà servie. */
export const PREVIOUS_TURN: readonly StepAction[] = SESSION_LESSON.steps.flatMap((step) =>
  (step.actions ?? []).filter((action) => action.type === "event"),
);

/** L'agent se met au travail : il se lève, et le modèle relit toute la pile. */
export const WAKE_UP: readonly StepAction[] = [
  event("session.status_running", "l'agent se met au travail", "session"),
  { type: "status", status: "running" },
  { type: "mood", mood: "thinking" },
  { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
  { type: "modelRequest" },
];

/** Un « user.message » entre dans la pièce et réveille l'agent. */
export function userMessage(text: string, from: Place = "app"): readonly StepAction[] {
  return [hop(from, "agent", "user.message", "entry"), event("user.message", text, "app"), ...WAKE_UP];
}

/** L'appel à « reply_ticket » tel que le flux l'affiche. */
export function replyTicketCall(ticket: number): string {
  return `reply_ticket({"ticket":${ticket}})`;
}

/** L'agent demande un outil custom : la session s'arrête et attend ton backend. */
export function asksBackend(call: string): readonly Effect[] {
  return [
    event("agent.custom_tool_use", call, "agent"),
    event("session.status_idle", "requires_action : la session attend ton backend", "session"),
    { type: "mood", mood: "waiting" },
  ];
}

/** Ton backend a exécuté l'outil et renvoie le résultat : la session reprend, le modèle relit la pile. */
export function backendAnswers(text: string): readonly StepAction[] {
  return [
    event("user.custom_tool_result", text, "app"),
    event("session.status_running", "l'agent reprend", "session"),
    { type: "mood", mood: "thinking" },
    { type: "modelRequest" },
  ];
}

/** Le tour se termine sans rien attendre de toi. */
export const END_OF_TURN: readonly Effect[] = [
  event("session.status_idle", "end_turn : le tour est terminé", "session"),
  { type: "status", status: "idle" },
  { type: "mood", mood: "idle" },
];

/** L'agent écrit sa réponse, puis le tour se termine. */
export function agentReply(text: string): readonly Effect[] {
  return [{ type: "bubble", text }, event("agent.message", text, "agent"), ...END_OF_TURN];
}

/** L'agent n'a plus rien à faire : il se tait et retourne se coucher. */
export const BACK_TO_BED: readonly Effect[] = [
  { type: "bubble", text: null },
  { type: "mood", mood: "idle" },
  { type: "move", to: AGENT_HOME, durationMs: WALK_MS },
];

/** Le client du SDK, en tête d'un script qui n'a besoin de rien d'autre. */
export const CLIENT_BLOCK: CodeBlock = {
  id: "client",
  lines: ['import Anthropic from "@anthropic-ai/sdk";', "", "const client = new Anthropic(); // lit ANTHROPIC_API_KEY", ""],
};

/** L'en-tête de « setup.ts » : le client, et l'outil custom de la leçon principale. */
export const SETUP_HEAD: CodeBlock = {
  id: "head",
  lines: [
    'import Anthropic from "@anthropic-ai/sdk";',
    'import { REPLY_TICKET_TOOL } from "./tools"; // l\'outil custom de la leçon principale',
    "",
    "const client = new Anthropic(); // lit ANTHROPIC_API_KEY",
    "",
  ],
};

/** La boucle de la leçon principale : les chapitres y glissent leurs propres blocs. */
export const LOOP_OPEN: CodeBlock = {
  id: "loop",
  lines: ["  // Dans ta route : la boucle de la leçon principale.", "  for await (const event of stream) {"],
};

export const LOOP_CLOSE: CodeBlock = {
  id: "on-idle",
  lines: [
    "    // « idle » sans action attendue de toi : le tour est fini.",
    '    if (event.type === "session.status_idle" && event.stop_reason.type !== "requires_action") {',
    "      break;",
    "    }",
    "  }",
  ],
};
