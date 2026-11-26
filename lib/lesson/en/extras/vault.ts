import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../../types";
import {
  agentReply,
  BACK_TO_BED,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  ROUTE,
  SETUP,
  SETUP_HEAD,
  userMessage,
} from "./shared";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "environment",
      lines: [
        "// The network stays closed. List the host of the MCP server the agent declares:",
        "// otherwise, opening the session is refused.",
        "const environment = await client.beta.environments.create({",
        '  name: "support",',
        '  config: { type: "cloud", networking: { type: "limited", allowed_hosts: ["payments.example"] } },',
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
        "  // The address of the Payments service. No credential here.",
        '  mcp_servers: [{ type: "url", name: "payments", url: "https://payments.example/mcp" }],',
        "  tools: [",
        "    REPLY_TICKET_TOOL,",
        "    // The service's tools, including create_refund. By default, every",
        '    // call waits for your approval: that is the "always_ask" policy.',
        '    { type: "mcp_toolset", mcp_server_name: "payments" },',
        "  ],",
        "});",
        "",
      ],
    },
    {
      id: "vault",
      lines: [
        "// The vault, still empty. Your route attaches it to each session, with vault_ids.",
        'const vault = await client.beta.vaults.create({ display_name: "Support keys" });',
        "",
      ],
    },
    {
      id: "credential",
      lines: [
        "// The service's credential, tied to the address of its MCP server.",
        "// Anthropic attaches it to the call; the API never returns it.",
        "// The vault is already attached to the session: adding the key is enough.",
        "await client.beta.vaults.credentials.create(vault.id, {",
        '  display_name: "Payments key",',
        "  auth: {",
        '    type: "static_bearer",',
        '    mcp_server_url: "https://payments.example/mcp",',
        '    token: requireEnv("PAYMENTS_API_KEY"),',
        "  },",
        "});",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "session",
      lines: [
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "    vault_ids: [VAULT_ID], // the support vault, even if empty",
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-error",
      lines: [
        "    // The connection to an MCP server failed: the session goes on, without its tools.",
        '    if (event.type === "session.error" && event.error.type === "mcp_authentication_failed_error") {',
        '      logError("Service refused", event.error.mcp_server_name);',
        "    }",
        "",
      ],
    },
    {
      id: "on-mcp-tool",
      lines: [
        "    // A tool of the Payments service: nothing to run on your side, an approval to give.",
        '    if (event.type === "agent.mcp_tool_use" && event.evaluated_permission === "ask") {',
        "      const isApproved = await askHuman(event.name, event.input); // your rule, or a person",
      ],
    },
    {
      id: "confirm",
      lines: [
        "      await client.beta.sessions.events.send(session.id, {",
        "        events: [",
        '          { type: "user.tool_confirmation", tool_use_id: event.id, result: isApproved ? "allow" : "deny" },',
        "        ],",
        "      });",
        "    }",
        "",
      ],
    },
    {
      id: "on-mcp-result",
      lines: [
        "    // The result goes through the stream for information: Anthropic called the service.",
        '    if (event.type === "agent.mcp_tool_result" && event.is_error) {',
        '      logError("Service call failed", event.mcp_tool_use_id);',
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

const REFUND_CALL = 'payments.create_refund({"order":"A-1042","amount":49})';
const DENIED = "mcp_authentication_failed_error: the “payments” server requires a credential";

/** A tool from a third-party service: Anthropic calls it with a key from the vault, after your approval. */
export const VAULT_LESSON: Lesson = {
  id: "approval",
  title: "Your approval before a sensitive call",
  summary: "A refund: without a key in the vault the service refuses the connection, with the key the call waits for your go-ahead.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "service",
      title: "A tool that is not on your side",
      text: [
        "Alice wants a refund. The “create_refund” tool is not in your backend: it belongs to the Payments service.",
        "This service is attached to the agent through an MCP server, a standard protocol for exposing tools. Anthropic will call it, without going through your backend.",
        "The agent only declares the server's address. The credential must be in the vault: for now, it is empty.",
      ],
      code: { file: SETUP, blocks: ["environment", "agent", "vault"] },
      session: { extraToolLines: ["create_refund: refunds a customer's order (Payments service, through MCP)"] },
    }),
    {
      id: "denied",
      title: "Without a key, the service refuses the connection",
      text: [
        "Your backend passes the request on. Anthropic looks in the vault for a credential for the Payments address, and finds none.",
        "The connection goes out anyway, without a credential. The service refuses it: the session emits “session.error”, of type “mcp_authentication_failed_error”.",
        "The session goes on, but without the Payments tools. All the agent can do is say so.",
      ],
      code: { file: ROUTE, blocks: ["session", "on-error"] },
      actions: [
        ...userMessage("Refund Alice's order A-1042: €49."),
        { type: "key", key: "paiements", isDenied: true },
        hop("vault", "service:paiements", "no credential", "error"),
        event("session.error", DENIED, "session", true),
        ...agentReply("I can't refund Alice: I don't have access to the Payments service tools."),
        { type: "mood", mood: "stunned" },
      ],
    },
    {
      id: "credential",
      title: "You put the key in the vault",
      text: [
        "You create a credential in the vault, tied to the address of the Payments MCP server.",
        "Once stored, the key never comes out again: the API never returns it, neither to the agent nor to your backend.",
        "No need for another session: Anthropic re-reads the vault's credentials during a session, and retries the connection each time it resumes.",
      ],
      code: { file: SETUP, blocks: ["credential"] },
      sets: { vaultKeys: ["paiements"] },
      actions: [
        { type: "bubble", text: null },
        { type: "mood", mood: "idle" },
      ],
    },
    {
      id: "approval",
      title: "Second try: the session waits for your approval",
      text: [
        "Your backend sends the request again. This time, the connection to Payments succeeds, and the agent asks for “create_refund”: the event is called “agent.mcp_tool_use”.",
        "But a third-party service tool is “always_ask” by default. Before the call goes out, the session goes “idle” and waits for your approval.",
      ],
      code: { file: ROUTE, blocks: ["on-mcp-tool"] },
      actions: [
        ...userMessage("Try again: refund Alice's order A-1042."),
        event("agent.mcp_tool_use", REFUND_CALL, "agent"),
        hop("agent", "vault", "create_refund", "call"),
        event("session.status_idle", "requires_action: this call is waiting for your approval", "session"),
        { type: "approval", request: { tool: "MCP payments", target: "create_refund · €49 for Alice" } },
        { type: "status", status: "waiting_approval" },
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "allowed",
      title: "You approve, the call goes out with the key",
      text: [
        "Your backend answers with “user.tool_confirmation” and “allow”, and the session resumes.",
        "Anthropic takes the key from the vault, attaches it to the call and contacts Payments. None of this goes through your backend.",
        "The agent only receives the result: it never saw the key.",
      ],
      code: { file: ROUTE, blocks: ["confirm", "on-mcp-result"] },
      actions: [
        { type: "approval", request: null },
        event("user.tool_confirmation", "allow", "app"),
        event("session.status_running", "the agent resumes", "session"),
        { type: "status", status: "running" },
        { type: "key", key: "paiements", isDenied: false },
        hop("vault", "service:paiements", "+ credential", "call"),
        event("agent.mcp_tool_result", "Refund of €49 completed for order A-1042.", "mcp"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "Two kinds of tools",
      text: [
        "The agent announces the refund, and the turn ends.",
        "A custom tool is run by your backend, with your access.",
        "An MCP tool is called by Anthropic, with a key from the vault: your backend only gives its approval.",
      ],
      code: { file: SETUP, blocks: ["agent", "credential"] },
      actions: [...agentReply("Done: Alice has been refunded €49."), ...BACK_TO_BED],
    },
  ],
};
