import { event } from "@/lib/workshop/effects";
import { WORKBENCH_STAND } from "@/lib/workshop/layout";
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
  WALK_MS,
} from "./shared";

const SYSTEM =
  "You answer support customers. To track a parcel, call the carrier's API with curl: the key is in the CARRIER_API_KEY variable.";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "environment",
      lines: [
        "// First lock: the environment lets traffic out to this site, and only this one.",
        "const environment = await client.beta.environments.create({",
        '  name: "support",',
        "  config: {",
        '    type: "cloud",',
        '    networking: { type: "limited", allowed_hosts: ["api.carrier.example"] },',
        "  },",
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
        "  // The instructions name the variable. Never the key.",
        `  system: ${JSON.stringify(SYSTEM)},`,
        "  // bash runs in the container: that is where curl will start from.",
        '  tools: [REPLY_TICKET_TOOL, { type: "agent_toolset_20260401" }],',
        "});",
        "",
      ],
    },
    {
      id: "vault",
      lines: ['const vault = await client.beta.vaults.create({ display_name: "Support keys" });', ""],
    },
    {
      id: "credential",
      lines: [
        "// A key for the container: a variable name, and the sites it is allowed to go to.",
        "await client.beta.vaults.credentials.create(vault.id, {",
        '  display_name: "Carrier key",',
        "  auth: {",
        '    type: "environment_variable",',
        '    secret_name: "CARRIER_API_KEY", // the name the container will see',
        '    secret_value: requireEnv("CARRIER_API_KEY"), // the real key, read on your side',
        "    // Second lock: the key only goes with requests to this site.",
        '    networking: { type: "limited", allowed_hosts: ["api.carrier.example"] },',
        "    // And only in their headers.",
        "    injection_location: { header: true, body: false },",
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
        "    // The vault that holds the carrier's key.",
        "    vault_ids: [VAULT_ID],",
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-builtin",
      lines: [
        "    // bash is a built-in tool: it goes through the stream, but you have nothing to send back.",
        '    if (event.type === "agent.tool_use") logStep(event.name, event.input);',
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

const CURL = 'curl -H "Authorization: Bearer $CARRIER_API_KEY" https://api.carrier.example/parcels/AB123';
const TRACKING = "Parcel AB123: out for delivery, expected tomorrow.";
const CARRIER = "service:transporteur";

/** A network call made from the container: the vault's key is added on the way out, never inside the container. */
export const SECRET_LESSON: Lesson = {
  id: "secret",
  title: "A secret for the container",
  summary: "The agent calls an API with curl: the container only sees a variable name, the key is added on the way out.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "need",
      title: "An API without an MCP server",
      text: [
        "The carrier has no MCP server: only an API, called with a key in a header.",
        "The agent can call it itself, with curl, from the container: the workbench, at the back of the room.",
        "That leaves the key. Written in the instructions or in a message, it would stay in the session history.",
      ],
      code: { file: SETUP, blocks: ["agent"] },
      adds: ["bench"],
      session: {
        system: SYSTEM,
        extraToolLines: ["bash, read, write, edit, glob, grep: run in the session's container"],
      },
    }),
    {
      id: "credential",
      title: "A key stored under a variable name",
      text: [
        "The vault accepts a second type of key: “environment_variable”. You give a variable name, the real value, and the sites it is allowed to go to.",
        "Two locks must open: the environment lets traffic out to this site, and the key only goes with requests to this site.",
      ],
      code: { file: SETUP, blocks: ["environment", "vault", "credential"] },
      sets: { vaultKeys: ["transporteur"] },
    },
    {
      id: "curl",
      title: "In the container: a name, not the key",
      text: [
        "Your backend asks where Alice's parcel is. The agent runs curl with “bash”, naming the variable.",
        "In the container, this variable only holds a placeholder, with no value. Even by printing it, the agent would not see the key.",
      ],
      code: { file: ROUTE, blocks: ["session"] },
      actions: [
        ...userMessage("Where is Alice's parcel AB123?"),
        event("agent.tool_use", `bash: ${CURL}`, "agent"),
        { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
        { type: "terminal", lines: [`$ ${CURL}`] },
      ],
    },
    {
      id: "egress",
      title: "The real key is added on the way out",
      text: [
        "The request leaves the container. On the way out, Anthropic takes the key from the vault and puts it in place of the placeholder, because the site is the one you authorized.",
        "For any other site, nothing is replaced: the key cannot go anywhere else.",
      ],
      code: { file: SETUP, blocks: ["credential"] },
      actions: [
        { type: "key", key: "transporteur", isDenied: false },
        hop("agent", CARRIER, "with the key", "call"),
      ],
    },
    {
      id: "result",
      title: "The answer comes back, without going through you",
      text: [
        "The carrier answers. The result comes back into the container, then into the stack with “agent.tool_result”.",
        "Your backend sees both events go by in the stream. It ran nothing, and has nothing to send back.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-builtin"] },
      actions: [
        hop(CARRIER, "agent", "result", "result"),
        { type: "terminal", lines: [`$ ${CURL}`, TRACKING] },
        event("agent.tool_result", TRACKING, "sandbox"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "limits",
      title: "What the vault does not do for you",
      text: [
        "The agent gives the answer, and the turn ends. The key never entered the stack, nor the container.",
        "The replacement only happens on the way out, in the headers or the body of a request. What comes back is not masked: if the service returns another secret, a session token for example, it arrives in the clear in the container.",
        "Remember the three paths of a key: your backend for your tools, the vault for an MCP server, the vault again for the container.",
      ],
      code: { file: SETUP, blocks: ["credential"] },
      actions: [...agentReply("Alice's parcel is out for delivery: it arrives tomorrow."), ...BACK_TO_BED],
    },
  ],
};
