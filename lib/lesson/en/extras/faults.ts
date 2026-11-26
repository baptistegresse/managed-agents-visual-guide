import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../../types";
import {
  agentReply,
  asksBackend,
  backendAnswers,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  openSession,
  replyTicketCall,
  ROUTE,
  userMessage,
} from "./shared";

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    {
      id: "on-error",
      lines: [
        "    // A failure is an event like any other: it does not interrupt the loop.",
        '    if (event.type === "session.error") {',
        '      // retry_status announces what comes next: "retrying", "exhausted" or "terminal".',
        "      logError(event.error.type, event.error.retry_status.type);",
        "    }",
        "",
      ],
    },
    {
      id: "on-rescheduled",
      lines: [
        "    // Passing failure: Anthropic reschedules the session and tries again. Nothing to do.",
        '    if (event.type === "session.status_rescheduled") continue;',
        "",
      ],
    },
    {
      id: "on-exhausted",
      lines: [
        "    // Turn failed (retries used up, or an error that cannot be retried): the session stays usable.",
        '    if (event.type === "session.status_idle" && event.stop_reason.type === "retries_exhausted") {',
        "      return retryInSameSession(message); // your code: the same session, the same request",
        "    }",
        "",
      ],
    },
    {
      id: "on-terminated",
      lines: [
        "    // Final: this session will not start again.",
        '    if (event.type === "session.status_terminated") {',
        "      return retryInNewSession(message); // your code: a new session, the same request",
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

/**
 * A failure arrives in the stream as an event, and “retry_status” says what comes next:
 * it heals by itself, the turn is lost, or the session is over.
 */
export const FAULTS_LESSON: Lesson = {
  id: "faults",
  title: "When it breaks",
  summary: "A failure arrives in the stream as an event: “retry_status” says whether it heals by itself, whether the turn is lost, or whether the session is over.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "events",
      title: "A failure is not an exception",
      text: [
        "When something breaks in the session, your code does not receive an exception.",
        "The failure arrives in the stream, like everything else: a “session.error” event.",
        "Its “retry_status” field tells you what to do: “retrying”, “exhausted” or “terminal”.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-error"] },
    }),
    {
      id: "transient",
      title: "A passing failure",
      text: [
        "Your backend sends a request, and the model is briefly overloaded.",
        "“session.error” describes the failure, with “retry_status” set to “retrying”.",
        "Often, “session.status_rescheduled” follows: Anthropic reschedules the session.",
      ],
      code: { file: ROUTE, blocks: ["on-error", "on-rescheduled"] },
      actions: [
        ...userMessage("Reply to Alice's ticket."),
        event("session.error", "model_overloaded_error, retry_status: retrying", "session", true),
        event("session.status_rescheduled", "the session is rescheduled: Anthropic will try again", "session"),
        { type: "status", status: "rescheduling" },
        { type: "mood", mood: "stunned" },
      ],
    },
    {
      id: "retry",
      title: "Anthropic tries again on its own",
      text: [
        "You have nothing to do, except keep the stream open.",
        "The session goes back to “running”. The agent picks up its turn and sees it through: it asks for its tool, your backend answers, it wraps up.",
      ],
      code: { file: ROUTE, blocks: ["on-rescheduled", "on-idle"] },
      actions: [
        event("session.status_running", "the session resumes after the failure", "session"),
        { type: "status", status: "running" },
        { type: "modelRequest" },
        ...asksBackend(replyTicketCall(1)),
        hop("app", "agent", "result", "result"),
        ...backendAnswers("Reply sent to Alice."),
        ...agentReply("All sorted: I replied to Alice."),
      ],
    },
    {
      id: "exhausted",
      title: "Retries used up: the turn is lost, not the session",
      text: [
        "Another request, another failure. Anthropic tries again, without success: “retry_status” is “exhausted”.",
        "The turn is lost, but the session goes back to “idle”, with the reason “retries_exhausted”.",
        "It stays usable. Read the “session.error” that came before: if the cause is temporary, your backend can send the request again in the same session; if not (a billing failure, for example), fix the cause first.",
      ],
      code: { file: ROUTE, blocks: ["on-error", "on-exhausted"] },
      actions: [
        { type: "bubble", text: null },
        ...userMessage("Reply to Bruno's ticket."),
        event("session.error", "model_overloaded_error, retry_status: retrying", "session", true),
        event("session.error", "model_overloaded_error, retry_status: exhausted", "session", true),
        event("session.status_idle", "retries_exhausted: the turn is lost, the session stays usable", "session"),
        { type: "status", status: "idle" },
        { type: "mood", mood: "stunned" },
      ],
    },
    {
      id: "fatal",
      title: "A final failure",
      text: [
        "Your backend sends the request again, and the failure is of a different kind: “retry_status” is “terminal”. Anthropic will not try again.",
        "The status that follows is “session.status_terminated”. The session will not accept any more events.",
      ],
      code: { file: ROUTE, blocks: ["on-error", "on-terminated"] },
      actions: [
        ...userMessage("Reply to Bruno's ticket."),
        event("session.error", "unknown_error, retry_status: terminal", "session", true),
        event("session.status_terminated", "the session is over, for good", "session"),
        { type: "status", status: "terminated" },
        { type: "mood", mood: "off" },
      ],
    },
    {
      id: "new-session",
      title: "A new session, and start over",
      text: [
        "A terminated session does not start again: your backend opens another one.",
        "Its stack is fresh. It is up to you to send it the request again, along with whatever useful the previous one had learned.",
      ],
      code: { file: ROUTE, blocks: ["on-terminated"] },
      actions: [openSession()],
    },
  ],
};
