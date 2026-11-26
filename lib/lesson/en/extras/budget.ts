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

/** The session's cap, then the one that restarts it, in cents. */
const BUDGET_CENTS = 50;
const RAISED_BUDGET_CENTS = 100;
/** What each request to the model costs in this scenario, in cents. */
const FIRST_REQUEST_CENTS = 30;
const SECOND_REQUEST_CENTS = 25;
const LAST_REQUEST_CENTS = 12;
const SPENT_AT_PAUSE_CENTS = FIRST_REQUEST_CENTS + SECOND_REQUEST_CENTS;
const CENTS_PER_DOLLAR = 100;

function dollars(cents: number): string {
  return `$${(cents / CENTS_PER_DOLLAR).toFixed(2)}`;
}

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "budget",
      lines: [
        "  // A spending cap, set when the session opens. The amount is in cents.",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        `    budget: { type: "limit", max_list_cost: { amount: "${BUDGET_CENTS}", currency: "USD" } },`,
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-budget",
      lines: [
        "    // Cap reached: the session is paused, not finished.",
        '    if (event.type === "session.status_idle" && event.stop_reason.type === "budget_reached") {',
        "      if (!(await mayRaiseBudget(session.id))) break; // your rule: carry on, or stop here",
      ],
    },
    {
      id: "raise",
      lines: [
        "      // A cap higher than the spend restarts the session by itself.",
        "      await client.beta.sessions.update(session.id, {",
        `        budget: { type: "limit", max_list_cost: { amount: "${RAISED_BUDGET_CENTS}", currency: "USD" } },`,
        "      });",
        "      continue;",
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

/** A spending cap per session: once reached, it pauses the session without losing anything. */
export const BUDGET_LESSON: Lesson = {
  id: "budget",
  title: "A budget per session",
  summary: "A spending cap: once reached, it pauses the session, and raising it restarts the session.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "cap",
      title: "A cap, set when the session opens",
      text: [
        "An agent runs in a loop, and every request to the model costs money.",
        `The budget is a spending cap for one session: here, ${BUDGET_CENTS} cents.`,
        "It is set when the session opens. A session opened without a budget cannot be given one afterwards.",
      ],
      code: { file: ROUTE, blocks: ["budget"] },
      session: { budgetCents: BUDGET_CENTS },
    }),
    {
      id: "spend",
      title: "The gauge goes up with every request",
      text: [
        "Your backend asks the agent to answer two tickets. Each time the model re-reads the stack, the spend goes up.",
        `After the first ticket, the session has spent ${FIRST_REQUEST_CENTS} cents. The next request brings it to ${SPENT_AT_PAUSE_CENTS}.`,
        "That request had already gone out: it runs to the end, and the agent asks for its tool for the second ticket.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: [
        ...userMessage("Answer Alice's and Bruno's tickets."),
        { type: "spend", cents: FIRST_REQUEST_CENTS },
        ...asksBackend(replyTicketCall(1)),
        ...backendAnswers("Reply sent to Alice."),
        { type: "spend", cents: SECOND_REQUEST_CENTS },
        ...asksBackend(replyTicketCall(2)),
        hop("agent", "app", "reply_ticket", "call"),
      ],
    },
    {
      id: "paused",
      title: "Cap reached: the session pauses",
      text: [
        `Your backend sends the result back. Before running the model again, Anthropic compares the spend to the cap: ${SPENT_AT_PAUSE_CENTS} cents against ${BUDGET_CENTS}.`,
        "The result is saved, but the model is not run again. “session.usage” reports the spend, then the session goes “idle” with the reason “budget_reached”.",
        "Nothing is lost: the stack and the container stay in place.",
      ],
      code: { file: ROUTE, blocks: ["on-budget"] },
      actions: [
        hop("app", "agent", "result", "result"),
        event("user.custom_tool_result", "Reply sent to Bruno.", "app"),
        event("session.thread_status_idle", "budget_reached: the thread stops before its next request", "session"),
        event("session.usage", `list_cost: ${dollars(SPENT_AT_PAUSE_CENTS)} spent`, "session"),
        event("session.status_idle", "budget_reached: the session's cap is reached", "session"),
        { type: "status", status: "paused_budget" },
        { type: "mood", mood: "off" },
      ],
    },
    {
      id: "raise",
      title: "Raising the cap restarts the session",
      text: [
        "No message restarts a paused session: a “user.message” would be refused.",
        "Your backend raises the cap with “sessions.update”. The session restarts by itself, right where it stopped.",
      ],
      code: { file: ROUTE, blocks: ["raise"] },
      actions: [
        { type: "budgetSet", cents: RAISED_BUDGET_CENTS },
        event("session.updated", `budget: cap raised to ${dollars(RAISED_BUDGET_CENTS)}`, "session"),
        event("session.status_running", "the session resumes", "session"),
        { type: "status", status: "running" },
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
        { type: "spend", cents: LAST_REQUEST_CENTS },
      ],
    },
    {
      id: "done",
      title: "The agent finishes",
      text: [
        "The agent wraps up, and the turn ends normally.",
        "A budget limits the work still to come, not the spend to the exact cent: the request in progress always runs to the end.",
        "“session.usage” actually comes before every switch to “idle”, not only this one. The other chapters do not show it, to stay readable.",
      ],
      code: { file: ROUTE, blocks: ["on-budget", "on-idle"] },
      actions: [...agentReply("All done: I answered Alice and Bruno."), ...BACK_TO_BED],
    },
  ],
};
