import type { ContextSetup } from "@/lib/workshop/context";
import { event, type Effect, type Place } from "@/lib/workshop/effects";
import { AGENT_DESK, AGENT_HOME } from "@/lib/workshop/layout";
import { AGENT_SETUP, BACKEND_FILE, SESSION_LESSON, WALK_MS } from "../base/session";
import { hop, type CodeBlock, type LessonStep, type Piece, type StepAction } from "../../types";

export { WALK_MS };

/** What the main lesson has already set up: each chapter starts from there. */
export const SCENE_PIECES: readonly Piece[] = ["agent", "room", "bench", "vault", "bed", "context"];

/** The two files of the main lesson, which the chapters complete. */
export const SETUP = "setup.ts";
export const ROUTE = BACKEND_FILE.name;

export interface SessionOptions {
  /** The agent's instructions, when the chapter changes them. */
  readonly system?: string;
  /** The tool definitions the chapter adds to the one for “reply_ticket”. */
  readonly extraToolLines?: readonly string[];
  readonly budgetCents?: number | null;
}

/** What the session writes on the stack when it opens: the chapter's agent configuration. */
export function contextSetup({ system, extraToolLines = [] }: SessionOptions = {}): ContextSetup {
  return {
    system: system ?? AGENT_SETUP.system,
    toolLines: [...AGENT_SETUP.toolLines, ...extraToolLines],
  };
}

/** Your backend opens a session: the stack holds only the agent's configuration. */
export function openSession(options: SessionOptions = {}): StepAction {
  return { type: "newSession", budgetCents: options.budgetCents ?? null, context: contextSetup(options) };
}

interface OpeningStep extends LessonStep {
  readonly session?: SessionOptions;
}

/**
 * The first step of a chapter: it puts the scene back where the main lesson
 * left it (the pieces set up, a session open, the agent in bed), then plays
 * what the chapter adds to it.
 */
export function openingStep({ session, adds = [], actions = [], ...step }: OpeningStep): LessonStep {
  return { ...step, adds: [...SCENE_PIECES, ...adds], actions: [openSession(session), ...actions] };
}

/** The main lesson's turn, as the stream saw it go by: it fills the stack of a session that has already been served. */
export const PREVIOUS_TURN: readonly StepAction[] = SESSION_LESSON.steps.flatMap((step) =>
  (step.actions ?? []).filter((action) => action.type === "event"),
);

/** The agent gets to work: it gets up, and the model re-reads the whole stack. */
export const WAKE_UP: readonly StepAction[] = [
  event("session.status_running", "the agent gets to work", "session"),
  { type: "status", status: "running" },
  { type: "mood", mood: "thinking" },
  { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
  { type: "modelRequest" },
];

/** A “user.message” enters the room and wakes the agent. */
export function userMessage(text: string, from: Place = "app"): readonly StepAction[] {
  return [hop(from, "agent", "user.message", "entry"), event("user.message", text, "app"), ...WAKE_UP];
}

/** The call to “reply_ticket” as the stream shows it. */
export function replyTicketCall(ticket: number): string {
  return `reply_ticket({"ticket":${ticket}})`;
}

/** The agent asks for a custom tool: the session stops and waits for your backend. */
export function asksBackend(call: string): readonly Effect[] {
  return [
    event("agent.custom_tool_use", call, "agent"),
    event("session.status_idle", "requires_action: the session is waiting for your backend", "session"),
    { type: "mood", mood: "waiting" },
  ];
}

/** Your backend has run the tool and sends back the result: the session resumes, the model re-reads the stack. */
export function backendAnswers(text: string): readonly StepAction[] {
  return [
    event("user.custom_tool_result", text, "app"),
    event("session.status_running", "the agent resumes", "session"),
    { type: "mood", mood: "thinking" },
    { type: "modelRequest" },
  ];
}

/** The turn ends without waiting for anything from you. */
export const END_OF_TURN: readonly Effect[] = [
  event("session.status_idle", "end_turn: the turn is over", "session"),
  { type: "status", status: "idle" },
  { type: "mood", mood: "idle" },
];

/** The agent writes its reply, then the turn ends. */
export function agentReply(text: string): readonly Effect[] {
  return [{ type: "bubble", text }, event("agent.message", text, "agent"), ...END_OF_TURN];
}

/** The agent has nothing left to do: it goes quiet and goes back to bed. */
export const BACK_TO_BED: readonly Effect[] = [
  { type: "bubble", text: null },
  { type: "mood", mood: "idle" },
  { type: "move", to: AGENT_HOME, durationMs: WALK_MS },
];

/** The SDK client, at the top of a script that needs nothing else. */
export const CLIENT_BLOCK: CodeBlock = {
  id: "client",
  lines: ['import Anthropic from "@anthropic-ai/sdk";', "", "const client = new Anthropic(); // reads ANTHROPIC_API_KEY", ""],
};

/** The head of “setup.ts”: the client, and the main lesson's custom tool. */
export const SETUP_HEAD: CodeBlock = {
  id: "head",
  lines: [
    'import Anthropic from "@anthropic-ai/sdk";',
    'import { REPLY_TICKET_TOOL } from "./tools"; // the main lesson\'s custom tool',
    "",
    "const client = new Anthropic(); // reads ANTHROPIC_API_KEY",
    "",
  ],
};

/** The main lesson's loop: the chapters slide their own blocks into it. */
export const LOOP_OPEN: CodeBlock = {
  id: "loop",
  lines: ["  // In your route: the main lesson's loop.", "  for await (const event of stream) {"],
};

export const LOOP_CLOSE: CodeBlock = {
  id: "on-idle",
  lines: [
    "    // “idle” with no action expected from you: the turn is over.",
    '    if (event.type === "session.status_idle" && event.stop_reason.type !== "requires_action") {',
    "      break;",
    "    }",
    "  }",
  ],
};
