import type { ToolId } from "@/lib/workshop/catalog";
import { THREAD_PREFIX } from "@/lib/workshop/context";
import { event, type Effect } from "@/lib/workshop/effects";
import { THREAD_SPOTS } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../../types";
import {
  agentReply,
  BACK_TO_BED,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  replyTicketCall,
  ROUTE,
  SETUP,
  SETUP_HEAD,
  userMessage,
  WALK_MS,
} from "./shared";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "agent",
      lines: [
        "const agent = await client.beta.agents.create({",
        '  name: "Support assistant",',
        '  model: "claude-haiku-5-5",',
        '  system: "You answer support customers.",',
        "  tools: [REPLY_TICKET_TOOL],",
      ],
    },
    {
      id: "multiagent",
      lines: [
        "  // The agent can hand part of the work to copies of itself.",
        "  multiagent: {",
        '    type: "multiagent_20261001",',
        "    subagents: {",
        '      type: "enabled",',
        '      predefined_agents: [{ type: "self" }], // copies of itself',
        "      // Without this line, it could also invent other agents on the spot.",
        '      inline_agents: { type: "disabled" },',
        "    },",
        '    workflows: { type: "disabled" },',
        "  },",
        "});",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    {
      id: "on-thread",
      lines: [
        "    // To follow the work: a copy opens its thread, then stops.",
        "    // Its stop_reason says whether it is done, or waiting for your backend.",
        '    if (event.type === "session.thread_created" || event.type === "session.thread_status_idle") {',
        "      logStep(event.type, event.session_thread_id);",
        "    }",
        "    // A copy reports back to the agent with a message, from one thread to another.",
        '    if (event.type === "agent.thread_message_received") {',
        "      logStep(event.type, event.from_session_thread_id);",
        "    }",
        "",
      ],
    },
    {
      id: "on-tool",
      lines: [
        "    // A copy's call arrives here, like the agent's.",
        '    if (event.type === "agent.custom_tool_use") {',
        "      // session_thread_id says which copy is asking.",
        "      logStep(event.name, event.session_thread_id);",
        "      const result = await replyToTicket(event.input.ticket);",
        "",
      ],
    },
    {
      id: "send-result",
      lines: [
        "      // The reply does not change: the call's identifier is enough to route it.",
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
    LOOP_CLOSE,
  ],
};

interface Copy {
  readonly id: number;
  readonly customer: string;
  readonly ticket: number;
}

const COPIES: readonly Copy[] = [
  { id: 1, customer: "Alice", ticket: 1 },
  { id: 2, customer: "Bruno", ticket: 2 },
];

/** What happens in a copy's thread carries this prefix: the agent's stack does not receive it. */
function inThread(copy: Copy, detail: string): string {
  return `${THREAD_PREFIX} ${copy.id}] ${detail}`;
}

/** One copy per thread, standing in the room, with or without a tool in hand. */
function copiesInRoom(carrying: ToolId | null): Effect {
  return {
    type: "helpers",
    helpers: COPIES.map((copy, index) => ({ id: copy.id, position: THREAD_SPOTS[index], moveMs: WALK_MS, carrying })),
  };
}

/** The agent hands part of the work to copies of itself: each has its own thread and its own stack. */
export const DELEGATION_LESSON: Lesson = {
  id: "delegation",
  title: "Delegating to copies",
  summary: "The agent splits the work between copies of itself, each with its own thread and stack.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "multiagent",
      title: "One agent, several threads",
      text: [
        "An agent handles its tasks one by one, in a single stack.",
        "With “multiagent”, it can hand part of the work to copies of itself. You turn it on in the agent's configuration.",
        "Your backend hardly changes at all.",
      ],
      code: { file: SETUP, blocks: ["multiagent"] },
      session: { extraToolLines: ["list_agents, send_to_agent: see the available agents and write to them (added by “multiagent”)"] },
    }),
    {
      id: "spawn",
      title: "The agent splits the work",
      text: [
        "Your backend asks the agent to answer Alice and Bruno. The agent opens two copies of itself, and hands one ticket to each.",
        "Each copy has its own thread and its own stack.",
        "It does not see the agent's stack: only the task the agent gave it.",
      ],
      code: { file: ROUTE, blocks: ["on-thread"] },
      actions: [
        ...userMessage("Answer Alice's and Bruno's tickets."),
        ...COPIES.flatMap((copy) => [
          event("session.thread_created", `copy ${copy.id}: a thread and a stack all its own`, "session"),
          event("agent.thread_message_sent", `to copy ${copy.id}: answer ${copy.customer}'s ticket`, "agent"),
        ]),
        copiesInRoom(null),
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "calls",
      title: "The copies ask your backend for their tool",
      text: [
        "Each copy asks for “reply_ticket”. These calls arrive in the session's stream, the one your backend already reads.",
        "One extra field, “session_thread_id”, says which copy is asking.",
        "Each thread stops to wait (“session.thread_status_idle”), then the whole session does: “session.status_idle”, as usual.",
      ],
      code: { file: ROUTE, blocks: ["on-tool"] },
      actions: [
        ...COPIES.map((copy) => event("agent.custom_tool_use", inThread(copy, replyTicketCall(copy.ticket)), "agent")),
        ...COPIES.map((copy) =>
          event("session.thread_status_idle", `copy ${copy.id}: requires_action, it waits for your backend`, "session"),
        ),
        event("session.status_idle", "requires_action: two calls are waiting for your backend", "session"),
        copiesInRoom("reply_ticket"),
        hop("agent", "app", "reply_ticket × 2", "call"),
      ],
    },
    {
      id: "results",
      title: "Your backend answers as before",
      text: [
        "Your backend runs both calls and sends back two “user.custom_tool_result” events.",
        "It cites each call's identifier, nothing more: Anthropic hands each result to the right copy.",
      ],
      code: { file: ROUTE, blocks: ["send-result"] },
      actions: [
        hop("app", "agent", "results", "result"),
        ...COPIES.map((copy) =>
          event("user.custom_tool_result", inThread(copy, `Reply sent to ${copy.customer}.`), "app"),
        ),
        event("session.status_running", "the copies resume", "session"),
        copiesInRoom(null),
      ],
    },
    {
      id: "report",
      title: "The copies report back",
      text: [
        "Each copy sends its report to the agent: “agent.thread_message_received”. Its thread stops too, this time with “end_turn”: the order between the two is not guaranteed.",
        "Only this report joins the agent's stack. The detail of the copy's work stays in its thread.",
        "That is the whole point: the main stack stays short.",
      ],
      code: { file: ROUTE, blocks: ["on-thread"] },
      actions: [
        ...COPIES.flatMap((copy) => [
          event("agent.thread_message_received", `copy ${copy.id}: ${copy.customer}'s ticket is handled`, "agent"),
          event("session.thread_status_idle", `copy ${copy.id}: end_turn, it is done`, "session"),
        ]),
        { type: "helpers", helpers: [] },
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
        ...agentReply("All done: Alice and Bruno have their answers."),
      ],
    },
    {
      id: "done",
      title: "What changes for your backend",
      text: [
        "Almost nothing: the copies' tool calls arrive in the same place, and you answer them the same way.",
        "What changes is in the room: several stacks instead of one, and work done in parallel.",
      ],
      code: { file: SETUP, blocks: ["multiagent"] },
      actions: BACK_TO_BED,
    },
  ],
};
