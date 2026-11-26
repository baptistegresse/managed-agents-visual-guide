import { AGENT_DESK, AGENT_HOME, WORKBENCH_STAND } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../../types";
import { WALK_MS } from "./session";

const AGENT_FILE: CodeFile = {
  name: "agent.ts",
  blocks: [
    {
      id: "custom",
      lines: [
        "// A custom tool: a name, a description, what you need to give it.",
        "const replyTicket = {",
        '  type: "custom",',
        '  name: "reply_ticket",',
        '  description: "Sends a reply to the customer and resolves their ticket.",',
        "  input_schema: {",
        '    type: "object",',
        '    properties: { ticket: { type: "integer" } },',
        '    required: ["ticket"],',
        "  },",
        "};",
        "",
      ],
    },
    {
      id: "builtin",
      lines: [
        "// The built-in tools. Commands and files run in the container;",
        "// web search runs on Anthropic's servers.",
        "const toolset = {",
        '  type: "agent_toolset_20260401",',
        '  default_config: { enabled: true, permission_policy: { type: "always_allow" } },',
        "};",
        "",
      ],
    },
    {
      id: "mcp",
      lines: [
        "// The tools of a third-party service, exposed by its MCP server.",
        "// By default, each one waits for your approval before it goes out. Here, we allow them outright.",
        "const payments = {",
        '  type: "mcp_toolset",',
        '  mcp_server_name: "payments",',
        '  default_config: { permission_policy: { type: "always_allow" } },',
        "};",
        "",
      ],
    },
    {
      id: "agent",
      lines: [
        "// The agent: a model, instructions, and the list of its tools.",
        "const agent = await client.beta.agents.create({",
        '  name: "Support assistant",',
        '  model: "claude-haiku-5-5",',
        '  system: "You answer support customers.",',
        "  tools: [replyTicket, toolset, payments],",
        '  mcp_servers: [{ type: "url", name: "payments", url: "https://payments.example/mcp" }],',
        "});",
        "",
      ],
    },
    {
      id: "save",
      lines: ["// One configuration, saved once.", 'await saveId("AGENT_ID", agent.id);'],
    },
  ],
};

const FILE = AGENT_FILE.name;

/** The tools: what a tool is, who runs it depending on its family, and the “agent” object that brings them together. */
export const TOOLS_LESSON: Lesson = {
  id: "tools",
  title: "The tools",
  summary: "What the agent is allowed to ask for, and who carries out each request.",
  before: { adds: ["agent", "room", "bench"], actions: [{ type: "move", to: AGENT_DESK, durationMs: 0 }] },
  files: [AGENT_FILE],
  steps: [
    {
      id: "what",
      title: "A tool is a described action",
      text: [
        "A tool comes down to three things: a name, a description, and the shape of the information to give it.",
        "The model reads the description to know when to use it. The clearer it is, the better it chooses.",
      ],
      code: { file: FILE, blocks: ["custom"] },
    },
    {
      id: "ask",
      title: "The agent asks, it doesn't run",
      text: [
        "When the model wants to act, it doesn't act: it writes a tool request, with the information filled in.",
        "So the question is always the same: who runs it? There are three possible answers.",
      ],
      code: { file: FILE, blocks: ["custom"] },
      actions: [
        { type: "mood", mood: "waiting" },
        hop("agent", "app", "reply_ticket", "call"),
      ],
    },
    {
      id: "custom",
      title: "Custom tool: your backend runs it",
      text: [
        "The request leaves the room and goes to your side. Your code acts, then sends the result back to the agent.",
        "It is the right choice for anything that touches your data: your database, your support inbox, your customers.",
      ],
      code: { file: FILE, blocks: ["custom"] },
      actions: [
        { type: "mood", mood: "thinking" },
        hop("app", "agent", "result", "result"),
      ],
    },
    {
      id: "builtin",
      title: "Built-in tools: the container runs them",
      text: [
        "Anthropic provides ready-made tools: run a command, read and write files, search the web.",
        "Commands and files run in the session's container: the agent goes to its workbench. Web search runs on Anthropic's servers. In both cases, nothing goes through your backend. With a “limited” network, web search is filtered too: it only returns results from the allowed hosts.",
      ],
      code: { file: FILE, blocks: ["builtin"] },
      actions: [
        { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
        { type: "terminal", lines: ["$ ls /workspace", "report.md"] },
      ],
    },
    {
      id: "mcp",
      title: "Third-party service tools: MCP",
      text: [
        "An outside service, a payment provider for example, can offer its own tools through an MCP server.",
        "The platform calls it directly. The request leaves the room on the right, without going through your backend.",
      ],
      code: { file: FILE, blocks: ["mcp"] },
      actions: [
        { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
        { type: "mood", mood: "waiting" },
        hop("agent", "service:paiements", "create_refund", "call"),
      ],
    },
    {
      id: "agent",
      title: "The agent is this list",
      text: [
        "The “agent” object brings together the model, its instructions and its tools. It is a configuration, saved once.",
        "Changing it creates a new version. And as long as no session is running, it does nothing: it sleeps.",
      ],
      code: { file: FILE, blocks: ["agent", "save"] },
      adds: ["bed"],
      actions: [
        { type: "mood", mood: "idle" },
        { type: "move", to: AGENT_HOME, durationMs: WALK_MS },
      ],
    },
  ],
};
