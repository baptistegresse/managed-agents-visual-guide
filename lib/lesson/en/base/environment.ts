import { AGENT_DESK, WORKBENCH_STAND } from "@/lib/workshop/layout";
import type { CodeFile, Lesson } from "../../types";
import { WALK_MS } from "./session";

const SETUP_FILE: CodeFile = {
  name: "setup.ts",
  blocks: [
    {
      id: "client",
      lines: ['import Anthropic from "@anthropic-ai/sdk";', "", "const client = new Anthropic();", ""],
    },
    {
      id: "create",
      lines: [
        "// The environment: the template for the container where the agent will work.",
        "const environment = await client.beta.environments.create({",
        '  name: "support",',
        "  config: {",
        '    type: "cloud", // a container hosted by Anthropic',
      ],
    },
    {
      id: "limited",
      lines: [
        "    // Closed network: nothing gets out, except to what you list.",
        "    // Always write it: without this line, the API opens everything.",
        '    networking: { type: "limited", allowed_hosts: ["api.carrier.example", "payments.example"] },',
      ],
    },
    {
      id: "open",
      lines: ["    // The other choice: almost all of the Internet is reachable.", '    // networking: { type: "unrestricted" },'],
    },
    {
      id: "close",
      lines: ["  },", "});", ""],
    },
    {
      id: "reuse",
      lines: [
        "// Create it only once. Each session will get a fresh container,",
        "// built from this template.",
        'await saveId("ENVIRONMENT_ID", environment.id);',
      ],
    },
  ],
};

const FILE = SETUP_FILE.name;

/** The environment: the machine where the agent works, what can leave it, and what runs inside it. */
export const ENVIRONMENT_LESSON: Lesson = {
  id: "environment",
  title: "The environment",
  summary: "Where the agent works: an isolated container, hosted by Anthropic.",
  before: { adds: ["agent", "room"], actions: [{ type: "move", to: AGENT_DESK, durationMs: 0 }] },
  files: [SETUP_FILE],
  steps: [
    {
      id: "why",
      title: "A place to work",
      text: [
        "An agent does more than talk. It may have to run a command, read a file, write a report.",
        "For that, it needs a machine. The environment describes that machine: a container, hosted by Anthropic.",
        "In the scene, it is the workbench at the back of the room. The room itself is the platform: the agent's loop runs there, outside the container.",
      ],
      code: { file: FILE, blocks: ["client", "create", "close"] },
      adds: ["bench"],
    },
    {
      id: "isolated",
      title: "Closed, if you ask for it",
      text: [
        "This container is isolated. With a “limited” network, nothing gets out, except to the addresses you allow.",
        "The barred hatch above the workbench is its network exit: it is closed.",
        "Careful: if you don't write “networking”, the API opens everything. Always write it.",
      ],
      code: { file: FILE, blocks: ["limited"] },
      sets: { networking: "limited" },
    },
    {
      id: "open",
      title: "Or open, if you decide so",
      text: [
        "With “unrestricted”, the container can reach almost all of the Internet: the hatch opens. Anthropic only applies a general safety blocklist: it is not a protection to rely on.",
        "It is more convenient, and riskier: what the agent reads outside can influence it. Start closed, and open what it needs.",
      ],
      code: { file: FILE, blocks: ["open"] },
      sets: { networking: "unrestricted" },
    },
    {
      id: "inside",
      title: "What runs inside",
      text: [
        "Running a command, reading or writing a file: these built-in tools run in the container. The agent goes to its workbench.",
        "Everything else runs elsewhere. The agent's loop, at Anthropic, outside the container. And your own tools, on your side: we get to them in the next chapter.",
      ],
      code: { file: FILE, blocks: ["create", "limited", "close"] },
      sets: { networking: "limited" },
      actions: [
        { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
      ],
    },
    {
      id: "template",
      title: "A template, not a machine",
      text: [
        "An environment is created only once. It is not a running machine: it is the recipe for building one.",
        "Each session gets a fresh container, built from it. Between two messages, its contents are kept, but only for 30 days after the container is created: activity does not extend that window.",
        "It disappears when you delete the session.",
      ],
      code: { file: FILE, blocks: ["reuse"] },
      actions: [
        { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
        { type: "mood", mood: "idle" },
      ],
    },
  ],
};
