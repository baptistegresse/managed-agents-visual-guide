import { hop, type CodeFile, type Lesson } from "../../types";
import { agentReply, asksBackend, BACK_TO_BED, backendAnswers, openingStep, replyTicketCall, userMessage } from "./shared";

const WEBHOOK_FILE: CodeFile = {
  name: "app/api/webhooks/support/route.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { answerToolCalls } from "../../support/loop"; // the main lesson\'s loop',
        'import { sessionFor } from "./sessions"; // your code: the session opened for this customer',
        'import { verifySignature } from "./signature"; // your code: the secret shared with the support inbox',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "route",
      lines: [
        "// The support inbox calls this address for every new ticket.",
        "export async function POST(request: Request) {",
      ],
    },
    {
      id: "verify",
      lines: [
        "  // 1. Anyone can call this address: check the signature first.",
        "  const ticket = await verifySignature(request); // null if it is wrong",
        '  if (!ticket) return new Response("Invalid signature", { status: 401 });',
        "",
      ],
    },
    {
      id: "send",
      lines: [
        "  // 2. The stream first, then the ticket, sent as a “user.message”.",
        "  const sessionId = await sessionFor(ticket.customer);",
        "  const stream = await client.beta.sessions.events.stream(sessionId);",
        "  await client.beta.sessions.events.send(sessionId, {",
        "    events: [",
        "      {",
        '        type: "user.message",',
        '        content: [{ type: "text", text: `Ticket ${ticket.id} (${ticket.customer}): ${ticket.text}` }],',
        "      },",
        "    ],",
        "  });",
        "",
      ],
    },
    {
      id: "loop",
      lines: [
        "  // 3. The same loop as in the main lesson: it runs",
        "  //    “reply_ticket” when the agent asks for it, until the turn ends.",
        "  await answerToolCalls(stream, sessionId);",
        "",
      ],
    },
    {
      id: "respond",
      lines: [
        "  // 4. The support inbox only expects an acknowledgment.",
        "  return new Response(null, { status: 204 });",
        "}",
      ],
    },
  ],
};

const FILE = WEBHOOK_FILE.name;
const TICKET_MESSAGE = "Ticket 1 (Alice): My parcel arrived broken.";

/** A ticket arrives in the support inbox: it, not a click, wakes the agent. */
export const WEBHOOK_LESSON: Lesson = {
  id: "webhook",
  title: "A customer writes: the webhook",
  summary: "A ticket arrives in your support inbox and wakes the agent, without anyone clicking.",
  files: [WEBHOOK_FILE],
  steps: [
    openingStep({
      id: "nobody",
      title: "Nobody clicked",
      text: [
        "In the main lesson, someone typed in your interface, and your interface called your route.",
        "Here, nobody is in front of the screen: it is the support inbox that notifies your server when a customer writes.",
        "This call from one system to another is called a webhook.",
      ],
      code: { file: FILE, blocks: ["imports", "route"] },
    }),
    {
      id: "ticket",
      title: "A customer writes",
      text: [
        "Alice writes to your support inbox: “My parcel arrived broken.” The support inbox immediately calls your server.",
        "Nothing has touched the room yet: the agent is asleep.",
        "This address is public. Before trusting the ticket, your route checks the signature of the call.",
      ],
      code: { file: FILE, blocks: ["verify"] },
      actions: [hop("desk", "webhook", "new ticket", "entry")],
    },
    {
      id: "message",
      title: "Your server sends the message",
      text: [
        "Your route opens the session's stream, then sends the ticket as a “user.message”.",
        "To the agent, nothing sets this message apart from the one in the main lesson: it wakes up, and the model re-reads the stack.",
      ],
      code: { file: FILE, blocks: ["send"] },
      actions: userMessage(TICKET_MESSAGE, "webhook"),
    },
    {
      id: "tool",
      title: "You know the rest",
      text: [
        "The agent asks for “reply_ticket”, your backend runs it and sends back the result.",
        "This is the main lesson's loop. That is why your route keeps the stream open after sending the message.",
      ],
      code: { file: FILE, blocks: ["loop"] },
      actions: [
        ...asksBackend(replyTicketCall(1)),
        hop("app", "agent", "result", "result"),
        ...backendAnswers("Reply sent to Alice."),
      ],
    },
    {
      id: "done",
      title: "Alice has her reply",
      text: [
        "The agent wraps up, the session goes back to “idle”, and your route acknowledges receipt to the support inbox.",
        "A webhook is just another way in. In the end, it is always your backend that sends a “user.message”.",
      ],
      code: { file: FILE, blocks: ["respond"] },
      actions: [...agentReply("All sorted: I replied to Alice."), ...BACK_TO_BED],
    },
  ],
};
