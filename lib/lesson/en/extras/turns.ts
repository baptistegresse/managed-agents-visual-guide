import { hop, type CodeFile, type Lesson } from "../../types";
import {
  agentReply,
  asksBackend,
  BACK_TO_BED,
  backendAnswers,
  openingStep,
  PREVIOUS_TURN,
  replyTicketCall,
  ROUTE,
  userMessage,
} from "./shared";

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "route",
      lines: [
        "// Your route now receives the ticket along with the message.",
        "export async function POST(request: Request) {",
        "  const { ticketId, message } = await request.json();",
        "",
      ],
    },
    {
      id: "find-session",
      lines: [
        "  // One session per ticket. Its id is stored in your database:",
        "  // the second request finds the first one's session.",
        "  const sessionId = (await findSessionId(ticketId)) ?? (await openSession(ticketId));",
        "",
      ],
    },
    {
      id: "send",
      lines: [
        "  // The rest does not change: the stream first, then the message.",
        "  const stream = await client.beta.sessions.events.stream(sessionId);",
        "  await client.beta.sessions.events.send(sessionId, {",
        '    events: [{ type: "user.message", content: [{ type: "text", text: message }] }],',
        "  });",
        "",
      ],
    },
    {
      id: "listen",
      lines: [
        "  // And the same loop: tool calls, reply, end of turn.",
        "  const answer = await listenUntilIdle(sessionId, stream);",
        "  return Response.json({ success: true, data: { answer }, error: null });",
        "}",
        "",
      ],
    },
    {
      id: "open-session",
      lines: [
        "// Only the very first request for a ticket opens a session.",
        "async function openSession(ticketId: string): Promise<string> {",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "  });",
        "  await saveSessionId(ticketId, session.id);",
        "  return session.id;",
        "}",
      ],
    },
  ],
};

/** The second message names neither the customer nor the ticket: only the stack makes it understandable. */
const FOLLOW_UP = "She says it still doesn't work. Follow up with her.";

/** A conversation: several turns in the same session, whose stack keeps everything. */
export const TURNS_LESSON: Lesson = {
  id: "turns",
  title: "A conversation over several turns",
  summary: "Keep the session's id, and send it another message: the stack remembers the previous turn.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "kept",
      title: "A session does not stop after one turn",
      text: [
        "In the session chapter, your route opened a new one on every request. Nothing forces it to.",
        "After a turn, the session goes back to “idle”: it waits for what comes next. Look at the stack: the first turn, Alice's, is still there.",
      ],
      code: { file: ROUTE, blocks: ["open-session"] },
      actions: PREVIOUS_TURN,
    }),
    {
      id: "id",
      title: "What links two requests: the id",
      text: [
        "To continue a conversation, your backend needs only one thing: the session's id.",
        "It stores it in its database, next to the ticket. On the next request, it finds it instead of opening a session.",
      ],
      code: { file: ROUTE, blocks: ["find-session", "open-session"] },
    },
    {
      id: "second",
      title: "A second message, in the same session",
      text: [
        "The customer has replied. Your backend sends: “She says it still doesn't work. Follow up with her.”",
        "The message says neither who nor which ticket. The agent knows anyway: it re-reads the whole stack, first turn included.",
        "It asks for “reply_ticket” again, for ticket 1.",
      ],
      code: { file: ROUTE, blocks: ["send"] },
      actions: [...userMessage(FOLLOW_UP), ...asksBackend(replyTicketCall(1)), hop("agent", "app", "reply_ticket", "call")],
    },
    {
      id: "answer",
      title: "The second turn stacks on top of the first",
      text: [
        "Your backend runs the tool and sends back the result. The agent wraps up, and the session goes back to “idle”.",
        "The stack now holds both turns, in order. That is what a conversation is: a single session, several turns.",
      ],
      code: { file: ROUTE, blocks: ["listen"] },
      actions: [
        hop("app", "agent", "result", "result"),
        ...backendAnswers("Follow-up sent to Alice."),
        ...agentReply("Done: I followed up with Alice."),
      ],
    },
    {
      id: "rule",
      title: "One session per conversation",
      text: [
        "A good rule of thumb: one session per conversation. Here, one per ticket.",
        "A message sent while the agent is working is queued, and handled in its turn. One exception: while the session is waiting for a tool's result, it refuses new messages.",
        "But the stack only grows. A session that lasts a very long time ends up being summarized: that is the annex “When the stack is full”.",
      ],
      code: { file: ROUTE, blocks: ["find-session"] },
      actions: BACK_TO_BED,
    },
  ],
};
