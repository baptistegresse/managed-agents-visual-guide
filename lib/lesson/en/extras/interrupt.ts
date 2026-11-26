import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../../types";
import {
  agentReply,
  asksBackend,
  BACK_TO_BED,
  backendAnswers,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  replyTicketCall,
  ROUTE,
  userMessage,
} from "./shared";

const STOP_ROUTE = "app/api/support/stop/route.ts";

const STOP_FILE: CodeFile = {
  name: STOP_ROUTE,
  blocks: [
    {
      id: "route",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        "",
        "const client = new Anthropic();",
        "",
        "// The “Stop” button in your interface calls this route.",
        "export async function POST(request: Request) {",
        "  const { sessionId } = await request.json();",
        "",
      ],
    },
    {
      id: "remember",
      lines: [
        "  // Note that the stop came from you: the stop reason will not say so.",
        "  await markInterrupted(sessionId);",
        "",
      ],
    },
    {
      id: "interrupt",
      lines: [
        "  // An event like any other, sent to the session in progress.",
        "  // You can send it at any time, even mid-turn.",
        "  await client.beta.sessions.events.send(sessionId, {",
        '    events: [{ type: "user.interrupt" }],',
        "  });",
        "",
        "  return Response.json({ success: true, data: null, error: null });",
        "}",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    LOOP_CLOSE,
    {
      id: "after",
      lines: [
        "",
        "  // Turn finished or turn interrupted? The reason is the same: “end_turn”.",
        "  // Your note tells them apart (or the “user.interrupt” that went by in the stream just before).",
        "  const wasInterrupted = await isInterrupted(session.id);",
        "  return Response.json({ success: true, data: { answer, wasInterrupted }, error: null });",
      ],
    },
  ],
};

/** Stopping a turn in progress: one more event, and a session that stays usable. */
export const INTERRUPT_LESSON: Lesson = {
  id: "interrupt",
  title: "Interrupting the agent",
  summary: "A “Stop” button: your backend sends “user.interrupt”, and the session goes back to “idle”.",
  files: [STOP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "long",
      title: "A turn can run long",
      text: [
        "A turn can be long: several tickets, several tool calls. Meanwhile, someone can change their mind.",
        "Closing the stream stops nothing: the session runs at Anthropic, not on your side. To stop it, you have to tell it.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-idle"] },
    }),
    {
      id: "working",
      title: "The agent is off on a long task",
      text: [
        "Your backend asks: “Reply to all the pending tickets.”",
        "The agent replies to Alice first, with your tool. Then it moves on to the next ticket.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: [
        ...userMessage("Reply to all the pending tickets."),
        ...asksBackend(replyTicketCall(1)),
        ...backendAnswers("Reply sent to Alice."),
      ],
    },
    {
      id: "stop",
      title: "Someone presses “Stop”",
      text: [
        "Your interface calls another route, which sends “user.interrupt” to the session.",
        "It is an event like the others: you send it with “events.send”, even mid-turn.",
        "If the model is in the middle of writing, it stops right away. If a tool is running, stopping can take a little longer.",
      ],
      code: { file: STOP_ROUTE, blocks: ["route", "interrupt"] },
      actions: [hop("app", "agent", "user.interrupt", "entry"), event("user.interrupt", "stop requested", "app")],
    },
    {
      id: "boundary",
      title: "The session goes back to “idle”",
      text: [
        "The agent stops in the middle of its work. The next ticket is not handled, and there is no final message.",
        "The stream announces “session.status_idle” with the reason “end_turn”: the same as for a turn that ended normally.",
        "So the reason does not tell the two apart. The stream does: “user.interrupt” went by just before. The simplest is still to remember that you asked for the stop.",
      ],
      code: { file: ROUTE, blocks: ["on-idle", "after"] },
      actions: [
        event("session.status_idle", "end_turn: the same reason as a finished turn", "session"),
        { type: "status", status: "idle" },
        { type: "mood", mood: "idle" },
      ],
    },
    {
      id: "after",
      title: "The session stays usable",
      text: [
        "The interruption stops the turn, nothing more: it does not tell the agent what to do next.",
        "The stack keeps what was done. For what comes next, your backend sends a new message, saying what to do instead.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: [
        ...userMessage("Stop for today. Where are you at?"),
        ...agentReply("I replied to Alice. The other tickets are not handled."),
      ],
    },
    {
      id: "recap",
      title: "Interrupting is not terminating",
      text: [
        "Interrupting stops the turn, not the session: it keeps its stack, and accepts what comes next.",
        "An interruption is meant for a session that is working: on an “idle” session there is no turn to stop.",
      ],
      code: { file: STOP_ROUTE, blocks: ["remember", "interrupt"] },
      actions: BACK_TO_BED,
    },
  ],
};
