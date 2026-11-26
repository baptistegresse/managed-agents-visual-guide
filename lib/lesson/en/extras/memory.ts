import { event } from "@/lib/workshop/effects";
import type { CodeFile, Lesson } from "../../types";
import {
  agentReply,
  BACK_TO_BED,
  CLIENT_BLOCK,
  openingStep,
  openSession,
  ROUTE,
  SETUP,
  userMessage,
  type SessionOptions,
} from "./shared";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    CLIENT_BLOCK,
    {
      id: "store",
      lines: [
        "// The notebook: small text files that outlive sessions.",
        "// The agent reads the description: tell it what it will find there.",
        "const store = await client.beta.memoryStores.create({",
        '  name: "support-notebook",',
        '  description: "The tone to use with customers.",',
        "});",
        "",
        "await saveIds({ memoryStoreId: store.id });",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "session",
      lines: ["  const session = await client.beta.sessions.create({", "    agent: AGENT_ID,", "    environment_id: ENVIRONMENT_ID,"],
    },
    {
      id: "mount",
      lines: [
        "    // The notebook is mounted in the container, under /mnt/memory/support-notebook/.",
        "    // The agent reads and writes it with its built-in file tools.",
        '    resources: [{ type: "memory_store", memory_store_id: MEMORY_STORE_ID, access: "read_write" }],',
        "  });",
      ],
    },
  ],
};

const NOTE_PATH = "/mnt/memory/support-notebook/tone.md";
const NOTE = "Use a casual tone with customers.";

/** Every session in this chapter has the notebook mounted, and its instructions mention it in one line. */
const SESSION: SessionOptions = {
  system: "You answer support customers.\nNotebook mounted: /mnt/memory/support-notebook/ (read and write).",
  extraToolLines: ["read, write: file tools, run in the session's container"],
};

/** A notebook mounted like a folder: what one session writes there, another can read back. */
export const MEMORY_LESSON: Lesson = {
  id: "memory",
  title: "Memory between two sessions",
  summary: "A notebook mounted like a folder: what one session writes there, the next one can read back.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "forget",
      title: "A session forgets everything",
      text: [
        "Every session starts again from a fresh stack: what the agent learned yesterday no longer exists.",
        "A “memory store” is a notebook that outlives sessions. You create it once, then mount it in the container of each session.",
        "For the agent, it is a plain folder, set here on the bedside table. It reads and writes it with its file tools, so the agent must have the built-in toolset (“agent_toolset_20260401”) enabled.",
      ],
      code: { file: SETUP, blocks: ["store"] },
      adds: ["memory"],
      session: SESSION,
    }),
    {
      id: "write",
      title: "The agent writes in the notebook",
      text: [
        "Your backend passes on an instruction: “From now on, use a casual tone with customers.”",
        "The agent saves it with the “write” tool, in the mounted folder.",
        "It is a built-in tool: it runs in the container, without going through your backend.",
      ],
      code: { file: ROUTE, blocks: ["session", "mount"] },
      actions: [
        ...userMessage("From now on, use a casual tone with customers. Remember it."),
        event("agent.tool_use", `write: ${NOTE_PATH}`, "agent"),
        { type: "memoryUse", isActive: true },
        { type: "memory", notes: [NOTE] },
        event("agent.tool_result", "File written: tone.md", "sandbox"),
        { type: "modelRequest" },
        ...agentReply("Noted: I will use a casual tone with customers."),
      ],
    },
    {
      id: "new-session",
      title: "The next day: a fresh session",
      text: [
        "Your backend opens another session. Its stack starts from the instructions and the tools: yesterday's sentence is not in it.",
        "The notebook has not moved: it is mounted in this new container, with the note inside.",
        "One line added to the instructions tells the agent the notebook exists. The notes themselves are not there.",
      ],
      code: { file: ROUTE, blocks: ["session", "mount"] },
      actions: [openSession(SESSION)],
    },
    {
      id: "read",
      title: "The agent reads the notebook again",
      text: [
        "Your backend asks the agent to write to Bruno. Before drafting, the agent reads the mounted folder.",
        "The note enters the stack at that moment, and only because the agent went to read it.",
      ],
      code: { file: ROUTE, blocks: ["mount"] },
      actions: [
        ...userMessage("Write to Bruno that his parcel goes out again tomorrow."),
        event("agent.tool_use", `read: ${NOTE_PATH}`, "agent"),
        { type: "memoryUse", isActive: true },
        event("agent.tool_result", NOTE, "sandbox"),
        { type: "modelRequest" },
      ],
    },
    {
      id: "reply",
      title: "It answers in the right tone",
      text: [
        "The agent writes to Bruno casually, as the note asks.",
        "The memory is not in the model: it is a file, read back by a session that knew nothing.",
      ],
      code: { file: ROUTE, blocks: ["mount"] },
      actions: agentReply("Hi Bruno! Your parcel goes out again tomorrow."),
    },
    {
      id: "done",
      title: "What you do not write in a notebook",
      text: [
        "Everything written in the notebook will be read back as is by the following sessions.",
        "So never store a secret there: keys go in the vault.",
      ],
      code: { file: SETUP, blocks: ["store"] },
      actions: BACK_TO_BED,
    },
  ],
};
