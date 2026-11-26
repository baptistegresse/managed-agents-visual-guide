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

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    LOOP_CLOSE,
    {
      id: "resume",
      lines: [
        "",
        "// When your server restarts: pick the listening back up on a session in progress.",
        "export async function resumeListening(sessionId: string) {",
      ],
    },
    {
      id: "reopen",
      lines: [
        "  // 1. Reopen the stream first. It replays nothing: it only gives what comes next.",
        "  const stream = await client.beta.sessions.events.stream(sessionId);",
        "",
      ],
    },
    {
      id: "history",
      lines: [
        "  // 2. Re-read the history: Anthropic kept every event, the outage included.",
        "  const history = await Array.fromAsync(client.beta.sessions.events.list(sessionId));",
        "",
      ],
    },
    {
      id: "pending",
      lines: [
        "  // 3. Answer the tool calls left without a result, and only those.",
        "  const answered = new Set(",
        '    history.flatMap((event) => (event.type === "user.custom_tool_result" ? [event.custom_tool_use_id] : [])),',
        "  );",
        "  for (const event of history) {",
        '    if (event.type === "agent.custom_tool_use" && !answered.has(event.id)) {',
        "      await runToolAndSendResult(sessionId, event);",
        "    }",
        "  }",
        "",
      ],
    },
    {
      id: "dedupe",
      lines: [
        "  // 4. Pick the live stream back up. An event can arrive by both paths:",
        "  //    its id keeps you from handling it twice.",
        "  const seen = new Set(history.map((event) => event.id));",
        "  for await (const event of stream) {",
        "    if (!seen.has(event.id)) await handle(sessionId, event);",
        '    if (event.type === "session.status_idle" && event.stop_reason.type !== "requires_action") break;',
        "  }",
        "}",
      ],
    },
  ],
};

/** The stream drops, the session carries on: when you come back, the history returns what the stream does not replay. */
export const RESUME_LESSON: Lesson = {
  id: "resume",
  title: "Resuming after an outage",
  summary: "Your server restarts mid-turn: the session carries on, and the history gives back what you missed.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "risk",
      title: "The stream can drop, the session cannot",
      text: [
        "The event stream is an open connection between your backend and Anthropic. It can drop: a deployment, a restart, a network outage.",
        "The session does not live on your side. It carries on, whether or not someone is listening.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-idle"] },
    }),
    {
      id: "working",
      title: "A turn starts normally",
      text: [
        "Your backend sends “Reply to Alice's ticket.” and listens to the stream.",
        "The agent gets up and re-reads its stack.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: userMessage("Reply to Alice's ticket."),
    },
    {
      id: "cut",
      title: "Your server restarts mid-turn",
      text: [
        "The connection drops. The agent does not notice: it asks for “reply_ticket”, and the session goes “idle” while waiting for the result.",
        "Nobody heard the request. As long as no one answers, the session just sits there, waiting.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: [...asksBackend(replyTicketCall(1)), hop("agent", "app", "stream cut", "error")],
    },
    {
      id: "no-replay",
      title: "Reopening the stream is not enough",
      text: [
        "Your server is back, and reopens the stream. But a stream replays nothing: it only gives the events still to come.",
        "The tool request was emitted during the outage. It will not come around again: just listening means waiting for nothing.",
      ],
      code: { file: ROUTE, blocks: ["resume", "reopen"] },
    },
    {
      id: "history",
      title: "The history, though, kept everything",
      text: [
        "Anthropic keeps every event of the session. “events.list” returns them all, the outage included.",
        "Your backend finds the tool request in it, and sees that no result followed it. That is the one it has to handle.",
      ],
      code: { file: ROUTE, blocks: ["history", "pending"] },
      actions: [hop("agent", "app", "events.list: the history", "result")],
    },
    {
      id: "answered",
      title: "The session restarts from where it was waiting",
      text: [
        "Your backend runs the tool and sends back the result. The session restarts, and the agent wraps up: nothing was lost.",
        "Then it listens to the live stream again. An event can arrive through the history and through the stream: its id keeps you from handling it twice.",
        "Do this on every connection, not only after a failure. That is what makes your backend restartable.",
      ],
      code: { file: ROUTE, blocks: ["pending", "dedupe"] },
      actions: [
        ...backendAnswers("Reply sent to Alice."),
        ...agentReply("All sorted: I replied to Alice."),
        ...BACK_TO_BED,
      ],
    },
  ],
};
