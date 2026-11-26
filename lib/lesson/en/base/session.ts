import { event } from "@/lib/workshop/effects";
import { AGENT_DESK, AGENT_HOME } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../../types";

export const WALK_MS = 700;

/** What the session writes into the agent's context before the first message. */
export const AGENT_SETUP = {
  system: "You answer support customers.",
  toolLines: ["reply_ticket: sends a reply to the customer and resolves their ticket"],
};

export const BACKEND_FILE: CodeFile = {
  name: "app/api/support/route.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { AGENT_ID, ENVIRONMENT_ID } from "./config";',
        'import { replyToTicket } from "./support"; // your code, your access',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "route",
      lines: [
        "// Your route: this is what your interface calls.",
        "export async function POST(request: Request) {",
        "  const { message } = await request.json();",
        "",
      ],
    },
    {
      id: "create-session",
      lines: [
        "  // 1. A session: one run of the agent, in its container.",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "  });",
        "",
      ],
    },
    {
      id: "open-stream",
      lines: [
        "  // 2. Open the stream before writing, so you miss no event.",
        "  const stream = await client.beta.sessions.events.stream(session.id);",
        "",
      ],
    },
    {
      id: "send-message",
      lines: [
        "  // 3. The request becomes an event sent to the session.",
        "  await client.beta.sessions.events.send(session.id, {",
        '    events: [{ type: "user.message", content: [{ type: "text", text: message }] }],',
        "  });",
        "",
      ],
    },
    {
      id: "loop",
      lines: [
        "  // 4. Everything the session does arrives here, event by event.",
        '  let answer = "";',
        "  for await (const event of stream) {",
      ],
    },
    {
      id: "on-message",
      lines: [
        '    if (event.type === "agent.message") {',
        "      for (const block of event.content) {",
        '        if (block.type === "text") answer += block.text;',
        "      }",
        "    }",
        "",
      ],
    },
    {
      id: "on-tool",
      lines: [
        "    // 5. The agent asks for a tool: the session stops and waits for you.",
        '    if (event.type === "agent.custom_tool_use") {',
      ],
    },
    {
      id: "run-tool",
      lines: [
        "      // Your code acts, with your access. The agent never touches it.",
        "      const result = await replyToTicket(event.input.ticket);",
        "",
      ],
    },
    {
      id: "send-result",
      lines: [
        "      // 6. You send the result back: the session resumes.",
        "      await client.beta.sessions.events.send(session.id, {",
        "        events: [",
        "          {",
        '            type: "user.custom_tool_result",',
        "            custom_tool_use_id: event.id,",
        '            content: [{ type: "text", text: result }],',
        "          },",
        "        ],",
        "      });",
        "    }",
        "",
      ],
    },
    {
      id: "on-idle",
      lines: [
        "    // 7. “idle” with no action expected from you: the turn is over.",
        '    if (event.type === "session.status_idle" && event.stop_reason.type !== "requires_action") {',
        "      break;",
        "    }",
        "  }",
        "",
      ],
    },
    {
      id: "respond",
      lines: ["  return Response.json({ success: true, data: { answer }, error: null });", "}"],
    },
  ],
};

const ROUTE = BACKEND_FILE.name;

/**
 * The session: one run of the agent. We follow a request from start to finish,
 * from your backend's route to the answer, event by event.
 */
export const SESSION_LESSON: Lesson = {
  id: "session",
  title: "The session",
  summary: "One run of the agent: your backend opens it, writes to it, and reads what it produces.",
  before: { adds: ["agent", "room", "bench", "bed"] },
  files: [BACKEND_FILE],
  steps: [
    {
      id: "what",
      title: "A session is one run",
      text: [
        "An agent and an environment do nothing until you start them: the agent sleeps.",
        "A session is one run: this agent, in a fresh container, for one conversation.",
        "Your backend opens it, writes to it, and reads what it produces. Let's follow a request from start to finish.",
      ],
      code: { file: ROUTE, blocks: ["imports"] },
    },
    {
      id: "request",
      title: "A request arrives on your side",
      text: [
        "In your interface, someone writes: “Reply to Alice's ticket.”",
        "Your interface calls your route. Nothing has touched Managed Agents yet: the agent is still asleep.",
      ],
      code: { file: ROUTE, blocks: ["route"] },
    },
    {
      id: "session",
      title: "Your backend opens a session",
      text: [
        "A session is one run of the agent, in a fresh container.",
        "The stack next to it is its context window. It already holds its instructions and the definition of its tools: that is all it knows.",
      ],
      code: { file: ROUTE, blocks: ["create-session"] },
      adds: ["context"],
      actions: [{ type: "newSession", budgetCents: null, context: AGENT_SETUP }],
    },
    {
      id: "stream",
      title: "It opens the event stream",
      text: [
        "Before writing to the session, your backend opens its event stream.",
        "Everything the session does will reach it through there, in order. Opening it first avoids missing the beginning.",
      ],
      code: { file: ROUTE, blocks: ["open-stream"] },
    },
    {
      id: "message",
      title: "It sends the message",
      text: [
        "The request goes out as a “user.message” event. It enters the room from the left: your backend is speaking.",
        "The agent wakes up. The message is added to its stack, and the model re-reads the whole stack to decide what to do.",
      ],
      code: { file: ROUTE, blocks: ["send-message"] },
      actions: [
        hop("app", "agent", "user.message", "entry"),
        event("user.message", "Reply to Alice's ticket.", "app"),
        event("session.status_running", "the agent gets to work", "session"),
        { type: "status", status: "running" },
        { type: "mood", mood: "thinking" },
        { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
        { type: "modelRequest" },
      ],
    },
    {
      id: "tool-call",
      title: "The agent asks for a tool",
      text: [
        "The model has decided: it needs the “reply_ticket” tool. It doesn't run it, it asks for it.",
        "The “agent.custom_tool_use” event leaves the room for your backend, and the session stops: “idle”, waiting for an action from you.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-tool"] },
      actions: [
        hop("agent", "app", "reply_ticket", "call"),
        event("agent.custom_tool_use", 'reply_ticket({"ticket":1})', "agent"),
        event("session.status_idle", "requires_action: the session is waiting for your backend", "session"),
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "run-tool",
      title: "Your backend runs the tool",
      text: [
        "Your backend calls a function of yours, with your access to your database and your support inbox.",
        "None of this goes through the room. The agent sees neither your code nor your credentials: it waits.",
      ],
      code: { file: ROUTE, blocks: ["run-tool"] },
      actions: [hop("app", "desk", "your code replies to Alice", "effect")],
    },
    {
      id: "result",
      title: "It sends the result back",
      text: [
        "Your backend sends the result back with “user.custom_tool_result”, citing the call's id.",
        "The result is added to the stack, the session resumes, and the model re-reads everything to decide what comes next.",
      ],
      code: { file: ROUTE, blocks: ["send-result"] },
      actions: [
        hop("app", "agent", "result", "result"),
        event("user.custom_tool_result", "Reply sent to Alice.", "app"),
        event("session.status_running", "the agent resumes", "session"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "The agent wraps up",
      text: [
        "The model needs no more tools: it writes its answer, which your backend reads in the stream.",
        "The session goes “idle” again, this time without waiting for anything from you: the turn is over, and your route answers your interface.",
      ],
      code: { file: ROUTE, blocks: ["on-message", "on-idle", "respond"] },
      actions: [
        { type: "bubble", text: "All done: I replied to Alice." },
        event("agent.message", "All done: I replied to Alice.", "agent"),
        event("session.status_idle", "end_turn: the turn is over", "session"),
        { type: "status", status: "idle" },
        { type: "mood", mood: "idle" },
      ],
    },
    {
      id: "recap",
      title: "What you just wired up",
      text: [
        "Four calls are enough: open a session, open its stream, send a message, and answer when the agent asks for a tool.",
        "The agent decides in its room; your backend acts outside. Between the two, there are only events.",
        "One building block is left to see: the vault, for the services the agent calls without going through you.",
      ],
      code: { file: ROUTE, blocks: ["create-session", "open-stream", "send-message", "send-result"] },
      actions: [
        { type: "bubble", text: null },
        { type: "move", to: AGENT_HOME, durationMs: WALK_MS },
      ],
    },
  ],
};
