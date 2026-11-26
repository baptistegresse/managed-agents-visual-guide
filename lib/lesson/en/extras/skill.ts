import { event } from "@/lib/workshop/effects";
import { LIBRARY_STAND } from "@/lib/workshop/layout";
import type { CodeFile, Lesson } from "../../types";
import { agentReply, BACK_TO_BED, openingStep, SETUP, userMessage, WALK_MS } from "./shared";

const SKILL_DESCRIPTION = "The procedure to follow before refunding a customer.";
const PROCEDURE = [
  "1. Check that the order is less than 30 days old.",
  "2. Check that the item was returned.",
  "3. Above €100, pass the case to a human.",
] as const;

const SKILL_FILE: CodeFile = {
  name: "skills/refund/SKILL.md",
  blocks: [
    {
      id: "description",
      lines: ["---", "name: refund", `description: ${SKILL_DESCRIPTION}`, "---", ""],
    },
    {
      id: "procedure",
      lines: ["# Refund a customer", "", ...PROCEDURE],
    },
  ],
};

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    {
      id: "head",
      lines: [
        'import Anthropic, { toFile } from "@anthropic-ai/sdk";',
        'import { readFile } from "node:fs/promises";',
        'import { REPLY_TICKET_TOOL } from "./tools"; // the custom tool from the main lesson',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "upload",
      lines: [
        "// The skill: a folder, with SKILL.md at its root. You upload it once.",
        "const skill = await client.skills.create({",
        '  files: [await toFile(readFile("skills/refund/SKILL.md"), "refund/SKILL.md")],',
        "});",
        "",
      ],
    },
    {
      id: "agent",
      lines: [
        "const agent = await client.beta.agents.create({",
        '  name: "Support assistant",',
        '  model: "claude-haiku-5-5",',
        '  system: "You answer support customers.",',
      ],
    },
    {
      id: "attach",
      lines: [
        "  // Attached to the agent: only its description enters the stack at startup.",
        '  skills: [{ type: "custom", skill_id: skill.id, version: "latest" }],',
      ],
    },
    {
      id: "tools",
      lines: [
        "  tools: [",
        "    REPLY_TICKET_TOOL,",
        "    // The agent opens SKILL.md with the “read” tool from the built-in toolset.",
        "    {",
        '      type: "agent_toolset_20260401",',
        '      default_config: { enabled: true, permission_policy: { type: "auto" } },',
        "      configs: [",
        '        { name: "web_search", enabled: false },',
        '        { name: "web_fetch", enabled: false },',
        "      ],",
        "    },",
        "  ],",
        "});",
      ],
    },
  ],
};

const SKILL = SKILL_FILE.name;

/** A skill only takes up one line of the stack until the task calls for opening it. */
export const SKILL_LESSON: Lesson = {
  id: "skill",
  title: "A skill, loaded on demand",
  summary: "A procedure stored in a folder: the agent only reads its content if the task calls for it.",
  files: [SKILL_FILE, SETUP_FILE],
  steps: [
    openingStep({
      id: "library",
      title: "Know-how stored in the library",
      text: [
        "A skill is a folder: a “SKILL.md” file that describes a procedure, sometimes with scripts alongside.",
        "This one explains how to handle a refund.",
        "When the session opens, only its description enters the stack: one line, not the procedure.",
      ],
      code: { file: SKILL, blocks: ["description"] },
      adds: ["library"],
      session: {
        extraToolLines: ["read: reads a file in the session's container", `skill “refund”: ${SKILL_DESCRIPTION}`],
      },
    }),
    {
      id: "attach",
      title: "You attach it to the agent",
      text: [
        "You upload the folder once, then name its id in the agent's configuration.",
        "It also needs the “read” tool: that is what the agent will use to open the file.",
      ],
      code: { file: SETUP, blocks: ["upload", "attach", "tools"] },
    },
    {
      id: "read",
      title: "The task calls for it: the agent opens the skill",
      text: [
        "Your backend asks: “Alice wants a refund. What needs to be checked?”",
        "The skill's description matches the task. So the agent will read “SKILL.md” with the “read” tool.",
        "It is an ordinary “agent.tool_use”, run in the container.",
      ],
      code: { file: SKILL, blocks: ["description"] },
      actions: [
        ...userMessage("Alice wants a refund. What needs to be checked?"),
        event("agent.tool_use", "read: SKILL.md of the skill “refund”", "agent"),
        { type: "move", to: LIBRARY_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
        { type: "spot", spot: "library" },
      ],
    },
    {
      id: "loaded",
      title: "The procedure enters the stack",
      text: [
        "The file's content comes back with “agent.tool_result”.",
        "Only now does the procedure take up space in the stack. For an unrelated request, the agent would have loaded nothing.",
      ],
      code: { file: SKILL, blocks: ["procedure"] },
      actions: [
        { type: "spot", spot: "library" },
        event("agent.tool_result", PROCEDURE.join(" "), "sandbox"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "The agent applies the procedure",
      text: [
        "The agent answers by following what it just read, and the turn ends.",
        "As long as it does not open it, a skill only costs one line in the stack. But each one makes the container start slower: only attach the ones the agent needs.",
      ],
      code: { file: SKILL, blocks: ["description", "procedure"] },
      actions: [
        ...agentReply("Three checks: the order is less than 30 days old, the item is returned, and above €100 a human decides."),
        ...BACK_TO_BED,
      ],
    },
  ],
};
