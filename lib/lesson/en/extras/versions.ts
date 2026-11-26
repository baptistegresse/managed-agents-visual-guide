import type { CodeFile, Lesson } from "../../types";
import { agentReply, BACK_TO_BED, openingStep, openSession, ROUTE, userMessage } from "./shared";

const FIRST_VERSION = 1;
const SECOND_VERSION = 2;
const SECOND_SYSTEM = "You answer support customers. You write to them in a casual tone.";
const REQUEST = "Write to Alice that her request has been received.";

const UPDATE_FILE: CodeFile = {
  name: "update-agent.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { AGENT_ID } from "./config";',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "update",
      lines: [
        "// Updating an agent rewrites nothing: it creates one more version.",
        "const updated = await client.beta.agents.update(AGENT_ID, {",
        `  version: ${FIRST_VERSION}, // the one you are changing: refused if someone changed it in the meantime`,
        `  system: "${SECOND_SYSTEM}",`,
        "});",
        "",
        `await saveIds({ agentVersion: updated.version }); // ${SECOND_VERSION}`,
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "latest",
      lines: [
        "  // The identifier alone: the session takes the latest version, when it opens.",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "  });",
        "",
      ],
    },
    {
      id: "pinned",
      lines: [
        "  // A pinned version: the session takes exactly that one.",
        "  const pinned = await client.beta.sessions.create({",
        `    agent: { type: "agent", id: AGENT_ID, version: ${FIRST_VERSION} },`,
        "    environment_id: ENVIRONMENT_ID,",
        "  });",
      ],
    },
  ],
};

const UPDATE = UPDATE_FILE.name;

/** Updating an agent creates a version: open sessions keep theirs, the next ones choose. */
export const VERSIONS_LESSON: Lesson = {
  id: "versions",
  title: "An agent's versions",
  summary: "Updating an agent creates a version: open sessions keep theirs, the next ones choose.",
  files: [UPDATE_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "versioned",
      title: "An agent is a versioned configuration",
      text: [
        `The main lesson's agent is at version ${FIRST_VERSION}, and a session is running on it.`,
        "When the session opened, the agent's instructions and tools were copied into the session's stack.",
      ],
      code: { file: ROUTE, blocks: ["latest"] },
      sets: { agentVersion: FIRST_VERSION },
    }),
    {
      id: "update",
      title: "You update the agent: version 2",
      text: [
        `You want the agent to write to customers in a casual tone. “agents.update” does not rewrite version ${FIRST_VERSION}: it creates version ${SECOND_VERSION}.`,
        "Look at the stack of the open session: it has not moved.",
      ],
      code: { file: UPDATE, blocks: ["update"] },
    },
    {
      id: "still-first",
      title: "The open session keeps its version",
      text: [
        "Your backend sends a request to the session that is already open.",
        `The agent writes to Alice in a formal tone: this session is still on version ${FIRST_VERSION}, and will stay on it until the end.`,
      ],
      code: { file: ROUTE, blocks: ["latest"] },
      actions: [...userMessage(REQUEST), ...agentReply("Dear Alice, we have received your request.")],
    },
    {
      id: "latest",
      title: "A new session takes the latest",
      text: [
        `Your backend opens another session, with only the agent's identifier. It takes the latest version: version ${SECOND_VERSION}.`,
        "The new instructions are in its stack. The same request now gets a casual answer.",
      ],
      code: { file: ROUTE, blocks: ["latest"] },
      sets: { agentVersion: SECOND_VERSION },
      actions: [
        openSession({ system: SECOND_SYSTEM }),
        ...userMessage(REQUEST),
        ...agentReply("Hi Alice, we got your request."),
      ],
    },
    {
      id: "pin",
      title: "Or the version you pin",
      text: [
        "To avoid depending on the latest version, name the one you want: the session will take exactly that one.",
        `It is also your way back. If version ${SECOND_VERSION} answers worse, open the following sessions on version ${FIRST_VERSION}.`,
      ],
      code: { file: ROUTE, blocks: ["pinned"] },
      actions: BACK_TO_BED,
    },
  ],
};
