import { event } from "@/lib/workshop/effects";
import { AGENT_DESK, AGENT_HOME } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../../types";
import { AGENT_SETUP, WALK_MS } from "./session";

const PAIEMENTS = "service:paiements";

const VAULT_FILE: CodeFile = {
  name: "vault.ts",
  blocks: [
    {
      id: "bad",
      lines: [
        "// Don't do this: write the key in the agent's instructions.",
        "// It would enter its context, re-read on every turn.",
        '// system: "To refund, use the key <the service key>"',
        "",
      ],
    },
    {
      id: "create",
      lines: [
        "// The vault: a safe, on Anthropic's side.",
        "const vault = await client.beta.vaults.create({",
        '  display_name: "Support keys",',
        "});",
        "",
      ],
    },
    {
      id: "credential",
      lines: [
        "// A key, tied to the address of the service it opens.",
        "await client.beta.vaults.credentials.create(vault.id, {",
        '  display_name: "Payments key",',
        "  auth: {",
        '    type: "static_bearer",',
        '    mcp_server_url: "https://payments.example/mcp",',
        '    token: requireEnv("PAYMENTS_API_KEY"),',
        "  },",
        "});",
        "",
      ],
    },
    {
      id: "session",
      lines: [
        "// The vault is plugged in when the session opens. With a “limited” network, the MCP server's",
        "// host must be in allowed_hosts (or allow_mcp_servers: true), otherwise opening is refused.",
        "const session = await client.beta.sessions.create({",
        "  agent: AGENT_ID,",
        "  environment_id: ENVIRONMENT_ID,",
        "  vault_ids: [vault.id],",
        "});",
        "",
      ],
    },
    {
      id: "custom",
      lines: [
        "// Your custom tools don't need it: they run on your side,",
        "// with your backend's secrets.",
        "const result = await replyToTicket(event.input.ticket);",
      ],
    },
  ],
};

const FILE = VAULT_FILE.name;

/** The vault: why it exists, what it holds, and how a key leaves with a call without the agent seeing it. */
export const VAULT_LESSON: Lesson = {
  id: "vault",
  title: "The vault",
  summary: "The keys to the services the agent calls without you, and which it never sees.",
  before: {
    adds: ["agent", "room", "bench", "bed", "context"],
    actions: [
      {
        type: "newSession",
        budgetCents: null,
        context: {
          system: AGENT_SETUP.system,
          toolLines: [...AGENT_SETUP.toolLines, "create_refund: refunds an order (Payments service)"],
        },
      },
    ],
  },
  files: [VAULT_FILE],
  steps: [
    {
      id: "problem",
      title: "A secret the agent must not see",
      text: [
        "To refund a customer, the Payments service requires a key.",
        "If you write it in the agent's instructions, it enters its stack: the model re-reads it on every turn, and could copy it out.",
        "The call has to leave with the key, without the agent seeing it.",
      ],
      code: { file: FILE, blocks: ["bad"] },
    },
    {
      id: "vault",
      title: "A safe, on Anthropic's side",
      text: [
        "The vault is that safe. It lives at Anthropic, apart from the agent and outside the container.",
        "In the scene, it is in a corner of the room, far from the workbench: the agent walks past it, but never opens it.",
      ],
      code: { file: FILE, blocks: ["create"] },
      adds: ["vault"],
    },
    {
      id: "credential",
      title: "A key, tied to a service",
      text: [
        "Here, the key is tied to the address of a service: the Payments MCP server.",
        "That way the platform knows which call to attach it to, and only that one.",
      ],
      code: { file: FILE, blocks: ["credential"] },
      sets: { vaultKeys: ["paiements"] },
    },
    {
      id: "attach",
      title: "Plugged into the session",
      text: [
        "The vault is plugged in when your backend opens the session, with “vault_ids”.",
        "Nothing else changes: not the agent, not its tools, not your code.",
        "One condition, which comes from the MCP server declared on the agent: with a “limited” network, its host must appear in “allowed_hosts” (or the environment must set “allow_mcp_servers” to true). Otherwise, opening the session is refused.",
      ],
      code: { file: FILE, blocks: ["session"] },
    },
    {
      id: "ask",
      title: "The agent asks for the refund",
      text: [
        "Someone writes: “Refund Bruno's order.” The agent asks for the Payments service's tool.",
        "The request doesn't go to your backend: it goes through the vault first.",
      ],
      code: { file: FILE, blocks: ["session"] },
      actions: [
        event("user.message", "Refund Bruno's order.", "app"),
        event("session.status_running", "the agent gets to work", "session"),
        { type: "status", status: "running" },
        { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
        { type: "mood", mood: "waiting" },
        { type: "modelRequest" },
        event("agent.mcp_tool_use", 'payments.create_refund({"order":"A-1042"})', "agent"),
        hop("agent", "vault", "create_refund", "call"),
      ],
    },
    {
      id: "key",
      title: "The key leaves with the call",
      text: [
        "The platform takes the key from the vault and attaches it to the call, as it leaves the room.",
        "The agent didn't see it. Neither did your backend: it isn't even on the path.",
      ],
      code: { file: FILE, blocks: ["credential", "session"] },
      actions: [
        { type: "key", key: "paiements", isDenied: false },
        hop("vault", PAIEMENTS, "with the key", "call"),
      ],
    },
    {
      id: "result",
      title: "The result comes back, not the key",
      text: [
        "The service refunds and replies. The result enters the agent's stack, and it wraps up.",
        "Look at the stack: the request and the result are there. The key never entered it.",
      ],
      code: { file: FILE, blocks: ["session"] },
      actions: [
        hop(PAIEMENTS, "agent", "result", "result"),
        event("agent.mcp_tool_result", "Refund of €39 issued for Bruno.", "mcp"),
        { type: "modelRequest" },
        event("agent.message", "Done: Bruno has been refunded.", "agent"),
        event("session.status_idle", "end_turn: the turn is over", "session"),
        { type: "status", status: "idle" },
        { type: "mood", mood: "idle" },
      ],
    },
    {
      id: "custom",
      title: "And your own tools?",
      text: [
        "Your custom tools don't need the vault: they run in your backend, which already has its own secrets.",
        "The vault serves one purpose only: the services the agent calls without going through you.",
      ],
      code: { file: FILE, blocks: ["custom"] },
      actions: [{ type: "move", to: AGENT_HOME, durationMs: WALK_MS }],
    },
    {
      id: "recap",
      title: "You know the basics",
      text: [
        "The agent: what it is. The environment: where it works. The session: one run, which your backend opens and listens to. The vault: the keys it never sees.",
        "Managed Agents runs all of this for you. Your backend keeps two roles: starting requests, and running your tools.",
        "The annexes are now open: each one adds a topic to these basics.",
      ],
      code: { file: FILE, blocks: ["create", "credential", "session"] },
    },
  ],
};
