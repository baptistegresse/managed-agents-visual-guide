import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson, type StepAction } from "../../types";
import { asksBackend, BACK_TO_BED, backendAnswers, END_OF_TURN, LOOP_CLOSE, LOOP_OPEN, openingStep, ROUTE, userMessage } from "./shared";

interface TicketToRead {
  readonly id: number;
  readonly customer: string;
  readonly problem: string;
}

/** The tickets your backend has the agent read, one after the other, in the same session. */
const FIRST: TicketToRead = { id: 1, customer: "Alice", problem: "I can no longer change my password." };
const NEXT: readonly TicketToRead[] = [
  { id: 2, customer: "Bruno", problem: "I haven't received my order." },
  { id: 3, customer: "Chloé", problem: "I would like to change my delivery address." },
  { id: 4, customer: "David", problem: "I was charged twice." },
];
const LAST: TicketToRead = { id: 5, customer: "Emma", problem: "My parcel arrived damaged." };

/**
 * A ticket's whole thread, as your tool returns it: it is long, and this whole
 * text is what goes into the agent's stack.
 */
function thread({ customer, problem }: TicketToRead): string {
  return [
    `Ticket thread from ${customer}: “${problem}”`,
    "The customer wrote on Monday morning, then followed up on Tuesday and again on Wednesday.",
    "They give their order number, their delivery address and the payment method they used.",
    "Support replied once to ask for a screenshot, which the customer sent the same day.",
    "A colleague then added an internal note: the problem seems to come from a recent update.",
    "Since then, the ticket has been waiting for a final answer, and the customer is asking to be called back.",
  ].join(" ");
}

/** A ticket read from start to finish: the request, the call, the thread your backend returns, the agent's summary. */
function readTicket(ticket: TicketToRead): readonly StepAction[] {
  return [
    ...userMessage(`Read ${ticket.customer}'s ticket and summarize it.`),
    ...asksBackend(`read_ticket({"ticket":${ticket.id}})`),
    ...backendAnswers(thread(ticket)),
    event("agent.message", `Summary: ${ticket.customer} is waiting for an answer about “${ticket.problem}”`, "agent"),
    ...END_OF_TURN,
  ];
}

const RESULT_HOP = hop("app", "agent", "the whole ticket thread", "result");

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    {
      id: "big-result",
      lines: [
        "    // What your tool returns goes into the agent's stack as it is.",
        '    if (event.type === "agent.custom_tool_use") {',
        "      const thread = await readTicket(event.input.ticket); // the whole thread: long",
        "      await client.beta.sessions.events.send(session.id, {",
        "        events: [",
        "          {",
        '            type: "user.custom_tool_result",',
        "            custom_tool_use_id: event.id,",
        '            content: [{ type: "text", text: thread }],',
        "          },",
        "        ],",
        "      });",
        "    }",
        "",
      ],
    },
    {
      id: "on-compact",
      lines: [
        "    // The stack was nearing its limit: Anthropic summarized the history.",
        "    // Nothing to answer. The event only says when it happened.",
        '    if (event.type === "agent.thread_context_compacted") {',
        '      logInfo("stack compacted", { at: event.processed_at });',
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

/**
 * When the stack is full: it only ever grows, tool results fill it quickly, and
 * at the threshold the platform summarizes the history.
 */
export const COMPACTION_LESSON: Lesson = {
  id: "compaction",
  title: "When the stack is full",
  summary: "The context window has a limit: at the threshold, the platform summarizes the history.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "grows",
      title: "The stack only ever grows",
      text: [
        "In a session, every message, every tool call and every result is added to the stack. Nothing ever leaves it.",
        "The model re-reads all of it on every turn: the taller it gets, the more each turn costs.",
        "It also has a maximum size, the dotted frame. Here it is tiny, so you can watch it fill up.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      session: { extraToolLines: ["read_ticket: reads a ticket's whole thread"] },
    }),
    {
      id: "heavy",
      title: "A tool result weighs a lot",
      text: [
        "Your backend asks the agent to read Alice's ticket. The agent calls “read_ticket”, and your backend sends back the whole thread.",
        "Look at the stack: the result, in blue, is much thicker than the request. Tool results are what fill a stack.",
      ],
      code: { file: ROUTE, blocks: ["big-result"] },
      actions: [...readTicket(FIRST), RESULT_HOP],
    },
    {
      id: "near",
      title: "The stack nears the threshold",
      text: [
        "Your backend follows up with three more tickets, in the same session.",
        "The red line is the threshold. Past it, there would not be enough room left for the agent to work.",
      ],
      code: { file: ROUTE, blocks: ["big-result"] },
      actions: [...NEXT.flatMap(readTicket), RESULT_HOP],
    },
    {
      id: "compacted",
      title: "Threshold crossed: the platform summarizes",
      text: [
        "At the fifth ticket, the stack goes past the threshold. Anthropic then summarizes the history: a dark block, much thinner, takes its place.",
        "The “agent.thread_context_compacted” event signals it in the stream. It does not say how many tokens were removed.",
        "No stop event comes with it: here, the agent goes on with its turn. The docs do not describe what happens to the turn beyond this event.",
      ],
      code: { file: ROUTE, blocks: ["on-compact"] },
      actions: readTicket(LAST),
    },
    {
      id: "lost",
      title: "What stays, what fades",
      text: [
        "The instructions do not move: they are fixed for the whole session. It is the history that gets condensed.",
        "Here, the detail of Alice's ticket is no longer in the stack: only a summary of it is left. The docs do not say what a summary keeps: assume any detail can disappear.",
        "Whatever must survive for sure is stored elsewhere: in a file in the container, or in memory.",
      ],
      code: { file: ROUTE, blocks: ["on-compact"] },
    },
    {
      id: "backend",
      title: "On the backend side: nothing to do, but worth watching",
      text: [
        "Compaction is automatic: your backend has nothing to answer.",
        "It is still worth tracking. A session that compacts often is too long, or reads too much each time.",
        "Opening one session per ticket, and having your tools return only what is useful, keeps stacks short.",
      ],
      code: { file: ROUTE, blocks: ["big-result", "on-compact"] },
      actions: BACK_TO_BED,
    },
  ],
};
