import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../types";
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
        "// Le réseau reste fermé. Il faut y lister l'hôte du serveur MCP que l'agent déclare :",
        "// sinon, l'ouverture de la session est refusée.",
        "const environment = await client.beta.environments.create({",
        '  name: "support",',
        '  config: { type: "cloud", networking: { type: "limited", allowed_hosts: ["paiements.example"] } },',
        "});",
        "",
      ],
    },
    {
      id: "agent",
      lines: [
        "const agent = await client.beta.agents.create({",
        '  name: "Assistant support",',
        '  model: "claude-haiku-5-5",',
        '  system: "Tu réponds aux clients du support.",',
        "  // L'adresse du service Paiements. Aucun identifiant ici.",
        '  mcp_servers: [{ type: "url", name: "paiements", url: "https://paiements.example/mcp" }],',
        "  tools: [",
        "    REPLY_TICKET_TOOL,",
        "    // Les outils du service, dont create_refund. Par défaut, chaque",
        '    // appel attend ton accord : c\'est la politique "always_ask".',
        '    { type: "mcp_toolset", mcp_server_name: "paiements" },',
        "  ],",
        "});",
        "",
      ],
    },
    {
      id: "vault",
      lines: [
        "// Le vault, encore vide. Ta route le branche à chaque session, avec vault_ids.",
        'const vault = await client.beta.vaults.create({ display_name: "Clés du support" });',
        "",
      ],
    },
    {
      id: "credential",
      lines: [
        "// L'identifiant du service, rattaché à l'adresse de son serveur MCP.",
        "// Anthropic le joint à l'appel ; l'API ne le renvoie jamais.",
        "// Le vault est déjà branché à la session : y ajouter la clé suffit.",
        "await client.beta.vaults.credentials.create(vault.id, {",
        '  display_name: "Clé Paiements",',
        "  auth: {",
        '    type: "static_bearer",',
        '    mcp_server_url: "https://paiements.example/mcp",',
        '    token: requireEnv("PAIEMENTS_API_KEY"),',
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
        "    vault_ids: [VAULT_ID], // le vault du support, même vide",
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-error",
      lines: [
        "    // La connexion à un serveur MCP a échoué : la session continue, sans ses outils.",
        '    if (event.type === "session.error" && event.error.type === "mcp_authentication_failed_error") {',
        '      logError("Service refusé", event.error.mcp_server_name);',
        "    }",
        "",
      ],
    },
    {
      id: "on-mcp-tool",
      lines: [
        "    // Un outil du service Paiements : rien à exécuter chez toi, un accord à donner.",
        '    if (event.type === "agent.mcp_tool_use" && event.evaluated_permission === "ask") {',
        "      const isApproved = await askHuman(event.name, event.input); // ta règle, ou une personne",
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
        "    // Le résultat passe dans le flux pour information : c'est Anthropic qui a appelé le service.",
        '    if (event.type === "agent.mcp_tool_result" && event.is_error) {',
        '      logError("Appel au service en échec", event.mcp_tool_use_id);',
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

const REFUND_CALL = 'paiements.create_refund({"order":"A-1042","amount":49})';
const DENIED = "mcp_authentication_failed_error : le serveur « paiements » exige un identifiant";

/** Un outil d'un service tiers : Anthropic l'appelle avec une clé du vault, après ton accord. */
export const VAULT_LESSON: Lesson = {
  id: "approval",
  title: "Ton accord avant un appel sensible",
  summary: "Un remboursement : sans clé au vault le service refuse la connexion, avec la clé l'appel attend ton feu vert.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "service",
      title: "Un outil qui n'est pas chez toi",
      text: [
        "Alice veut être remboursée. L'outil « create_refund » n'est pas dans ton backend : il appartient au service Paiements.",
        "Ce service est branché à l'agent par un serveur MCP, un protocole standard pour exposer des outils. C'est Anthropic qui l'appellera, sans passer par ton backend.",
        "L'agent ne déclare que l'adresse du serveur. L'identifiant, lui, doit se trouver dans le vault : pour l'instant, il est vide.",
      ],
      code: { file: SETUP, blocks: ["environment", "agent", "vault"] },
      session: { extraToolLines: ["create_refund : rembourse la commande d'un client (service Paiements, par MCP)"] },
    }),
    {
      id: "denied",
      title: "Sans clé, le service refuse la connexion",
      text: [
        "Ton backend transmet la demande. Anthropic cherche dans le vault un identifiant pour l'adresse de Paiements, et n'en trouve pas.",
        "La connexion part quand même, sans identifiant. Le service la refuse : la session émet « session.error », de type « mcp_authentication_failed_error ».",
        "La session continue, mais sans les outils de Paiements. L'agent ne peut que le dire.",
      ],
      code: { file: ROUTE, blocks: ["session", "on-error"] },
      actions: [
        ...userMessage("Rembourse la commande A-1042 d'Alice : 49 €."),
        { type: "key", key: "paiements", isDenied: true },
        hop("vault", "service:paiements", "sans identifiant", "error"),
        event("session.error", DENIED, "session", true),
        ...agentReply("Impossible de rembourser Alice : je n'ai pas accès aux outils du service Paiements."),
        { type: "mood", mood: "stunned" },
      ],
    },
    {
      id: "credential",
      title: "Tu ranges la clé dans le vault",
      text: [
        "Tu crées un identifiant dans le vault, rattaché à l'adresse du serveur MCP de Paiements.",
        "Une fois rangée, la clé ne ressort plus : l'API ne la renvoie jamais, ni à l'agent ni à ton backend.",
        "Pas besoin d'une autre session : Anthropic relit les identifiants du vault en cours de session, et retente la connexion à chaque reprise.",
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
      title: "Nouvel essai : la session attend ton accord",
      text: [
        "Ton backend renvoie la demande. Cette fois, la connexion à Paiements réussit, et l'agent demande « create_refund » : l'événement s'appelle « agent.mcp_tool_use ».",
        "Mais un outil de service tiers est en « always_ask » par défaut. Avant que l'appel parte, la session passe « idle » et attend ton accord.",
      ],
      code: { file: ROUTE, blocks: ["on-mcp-tool"] },
      actions: [
        ...userMessage("Réessaie : rembourse la commande A-1042 d'Alice."),
        event("agent.mcp_tool_use", REFUND_CALL, "agent"),
        hop("agent", "vault", "create_refund", "call"),
        event("session.status_idle", "requires_action : cet appel attend ton accord", "session"),
        { type: "approval", request: { tool: "MCP paiements", target: "create_refund · 49 € pour Alice" } },
        { type: "status", status: "waiting_approval" },
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "allowed",
      title: "Tu donnes ton accord, l'appel part avec la clé",
      text: [
        "Ton backend répond « user.tool_confirmation » avec « allow », et la session reprend.",
        "Anthropic prend la clé dans le vault, la joint à l'appel et contacte Paiements. Rien de tout cela ne passe par ton backend.",
        "L'agent ne reçoit que le résultat : il n'a jamais vu la clé.",
      ],
      code: { file: ROUTE, blocks: ["confirm", "on-mcp-result"] },
      actions: [
        { type: "approval", request: null },
        event("user.tool_confirmation", "allow", "app"),
        event("session.status_running", "l'agent reprend", "session"),
        { type: "status", status: "running" },
        { type: "key", key: "paiements", isDenied: false },
        hop("vault", "service:paiements", "+ identifiant", "call"),
        event("agent.mcp_tool_result", "Remboursement de 49 € effectué pour la commande A-1042.", "mcp"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "Deux sortes d'outils",
      text: [
        "L'agent annonce le remboursement, et le tour se termine.",
        "Un outil custom est exécuté par ton backend, avec tes accès.",
        "Un outil MCP est appelé par Anthropic, avec une clé du vault : ton backend ne fait que donner son accord.",
      ],
      code: { file: SETUP, blocks: ["agent", "credential"] },
      actions: [...agentReply("C'est fait : Alice est remboursée de 49 €."), ...BACK_TO_BED],
    },
  ],
};
