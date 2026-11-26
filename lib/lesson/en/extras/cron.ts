import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../../types";
import { agentReply, asksBackend, BACK_TO_BED, backendAnswers, openingStep, PREVIOUS_TURN, WAKE_UP } from "./shared";

const DEPLOY_FILE: CodeFile = {
  name: "deploy.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { AGENT_ID, ENVIRONMENT_ID, VAULT_ID } from "./config";',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "deployment",
      lines: [
        "// Run this once. After that, the clock runs at Anthropic.",
        "const deployment = await client.beta.deployments.create({",
        '  name: "Morning update",',
        "  agent: AGENT_ID,",
        "  environment_id: ENVIRONMENT_ID,",
        "  vault_ids: [VAULT_ID],",
      ],
    },
    {
      id: "initial-events",
      lines: [
        "  // The message every new session receives when it opens.",
        "  initial_events: [",
        "    {",
        '      type: "user.message",',
        '      content: [{ type: "text", text: "Give me the morning update on the pending tickets." }],',
        "    },",
        "  ],",
      ],
    },
    {
      id: "schedule",
      lines: [
        "  // A cron schedule: every day at 9 a.m., Paris time.",
        '  schedule: { type: "cron", expression: "0 9 * * *", timezone: "Europe/Paris" },',
        "});",
        "",
        "await saveIds({ deploymentId: deployment.id });",
      ],
    },
  ],
};

const NOTICE_FILE: CodeFile = {
  name: "app/api/webhooks/anthropic/route.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { listOpenTickets } from "../../support/support"; // your code, your access',
        "",
        "const client = new Anthropic(); // also reads ANTHROPIC_WEBHOOK_SIGNING_KEY",
        "",
      ],
    },
    {
      id: "verify",
      lines: [
        "// Check that the call really comes from Anthropic, then read the event.",
        "function readNotice(body: string, headers: Headers) {",
        "  try {",
        "    return client.beta.webhooks.unwrap(body, { headers: Object.fromEntries(headers) });",
        "  } catch {",
        "    return null; // signature missing or wrong",
        "  }",
        "}",
        "",
      ],
    },
    {
      id: "route",
      lines: [
        "// Anthropic calls this address when one of your sessions changes state.",
        "export async function POST(request: Request) {",
        "  const notice = readNotice(await request.text(), request.headers);",
        '  if (!notice) return new Response("Invalid signature", { status: 400 });',
        '  if (notice.data.type !== "session.status_idled") return new Response(null, { status: 204 });',
        "",
      ],
    },
    {
      id: "pending",
      lines: [
        "  // The call carries only an id: go and read what the session is waiting for.",
        "  const sessionId = notice.data.id;",
        '  const { data: events } = await client.beta.sessions.events.list(sessionId, { order: "desc" });',
        '  const idle = events.find((each) => each.type === "session.status_idle");',
        '  if (idle?.stop_reason.type !== "requires_action") return new Response(null, { status: 204 });',
        "  const pendingIds = idle.stop_reason.event_ids;",
        "",
      ],
    },
    {
      id: "answer",
      lines: [
        "  // Run each pending call and send back its result: the session resumes.",
        "  for (const each of events) {",
        '    if (each.type !== "agent.custom_tool_use" || !pendingIds.includes(each.id)) continue;',
        "    await client.beta.sessions.events.send(sessionId, {",
        "      events: [",
        "        {",
        '          type: "user.custom_tool_result",',
        "          custom_tool_use_id: each.id,",
        '          content: [{ type: "text", text: await listOpenTickets() }],',
        "        },",
        "      ],",
        "    });",
        "  }",
        "  return new Response(null, { status: 204 });",
        "}",
      ],
    },
  ],
};

const DEPLOY = DEPLOY_FILE.name;
const NOTICE = NOTICE_FILE.name;
const MORNING_MESSAGE = "Give me the morning update on the pending tickets.";
const OPEN_TICKETS = "2 pending tickets: Bruno (late parcel), Chloé (refund).";

/** A scheduled deployment: at every due time, Anthropic opens a fresh session, without your server asking. */
export const CRON_LESSON: Lesson = {
  id: "cron",
  title: "A clock: the scheduled deployment",
  summary: "A cron schedule opens a fresh session at every due time, without your server asking.",
  files: [DEPLOY_FILE, NOTICE_FILE],
  steps: [
    openingStep({
      id: "clock",
      title: "A clock in place of your backend",
      text: [
        "So far, a session opened because your backend asked for it. The stack still holds the exchange from the main lesson.",
        "A scheduled deployment hands that job to a clock, at Anthropic: you give it an agent, a schedule (in cron format) and the starting message.",
        "You run this script once. After that, your server has nothing left to do for the agent to wake up.",
      ],
      code: { file: DEPLOY, blocks: ["deployment", "initial-events", "schedule"] },
      adds: ["clock"],
      session: { extraToolLines: ["list_open_tickets: lists the tickets left without a reply"] },
      actions: PREVIOUS_TURN,
    }),
    {
      id: "firing",
      title: "The clock rings: a fresh session",
      text: [
        "At 9 a.m., give or take up to nine minutes, Anthropic itself opens a new session and drops the starting message into it.",
        "Look at the stack: it started over from the instructions and the tools. Nothing from the previous session is in it.",
      ],
      code: { file: DEPLOY, blocks: ["initial-events", "schedule"] },
      actions: [
        { type: "entry", point: "cron" },
        { type: "freshSession" },
        hop("cron", "agent", "user.message", "entry"),
        event("user.message", MORNING_MESSAGE, "entry"),
        ...WAKE_UP,
      ],
    },
    {
      id: "nobody",
      title: "The agent asks for a tool, and nobody is listening",
      text: [
        "The agent asks for “list_open_tickets”, a custom tool: your backend is the one that has to run it.",
        "But this time, none of your routes has opened the stream. The session waits, and it will keep waiting until someone answers.",
      ],
      code: { file: NOTICE, blocks: ["imports"] },
      actions: asksBackend("list_open_tickets({})"),
    },
    {
      id: "notice",
      title: "Anthropic notifies your server",
      text: [
        "In the Console, subscribe a route of your server to Anthropic's webhooks: it calls the route when a session goes “idle”.",
        "The call carries only the session's id. Your route checks the signature, then reads the events to find the pending tool call.",
      ],
      code: { file: NOTICE, blocks: ["verify", "route", "pending"] },
      actions: [hop("agent", "app", "webhook: session.status_idled", "call")],
    },
    {
      id: "answer",
      title: "Your backend answers, the session resumes",
      text: [
        "Your route runs the tool and sends back “user.custom_tool_result”, as in the main lesson.",
        "The session resumes right where it stopped.",
      ],
      code: { file: NOTICE, blocks: ["answer"] },
      actions: [hop("app", "agent", "result", "result"), ...backendAnswers(OPEN_TICKETS)],
    },
    {
      id: "done",
      title: "Tomorrow, another session",
      text: [
        "The agent writes its morning update, and the session goes back to “idle”.",
        "Tomorrow at 9 a.m., the clock will open another session, with a fresh stack: it will know nothing about this one.",
      ],
      code: { file: DEPLOY, blocks: ["schedule"] },
      actions: [...agentReply("Morning update: two tickets are waiting, Bruno's and Chloé's."), ...BACK_TO_BED],
    },
  ],
};
