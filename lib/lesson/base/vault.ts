import { event } from "@/lib/workshop/effects";
import { AGENT_DESK, AGENT_HOME } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../types";
import { AGENT_SETUP, WALK_MS } from "./session";

const PAIEMENTS = "service:paiements";

const VAULT_FILE: CodeFile = {
  name: "vault.ts",
  blocks: [
    {
      id: "bad",
      lines: [
        "// À ne pas faire : écrire la clé dans les consignes de l'agent.",
        "// Elle entrerait dans son contexte, relue à chaque tour.",
        '// system: "Pour rembourser, utilise la clé <la clé du service>"',
        "",
      ],
    },
    {
      id: "create",
      lines: [
        "// Le vault : un coffre, côté Anthropic.",
        "const vault = await client.beta.vaults.create({",
        '  display_name: "Clés du support",',
        "});",
        "",
      ],
    },
    {
      id: "credential",
      lines: [
        "// Une clé, rattachée à l'adresse du service qu'elle ouvre.",
        "await client.beta.vaults.credentials.create(vault.id, {",
        '  display_name: "Clé Paiements",',
        "  auth: {",
        '    type: "static_bearer",',
        '    mcp_server_url: "https://paiements.example/mcp",',
        '    token: requireEnv("PAIEMENTS_API_KEY"),',
        "  },",
        "});",
        "",
      ],
    },
    {
      id: "session",
      lines: [
        "// Le vault se branche à l'ouverture de la session. Avec un réseau « limited », l'hôte du",
        "// serveur MCP doit être dans allowed_hosts (ou allow_mcp_servers: true), sinon elle est refusée.",
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
        "// Tes outils custom n'en ont pas besoin : ils tournent chez toi,",
        "// avec les secrets de ton backend.",
        "const result = await replyToTicket(event.input.ticket);",
      ],
    },
  ],
};

const FILE = VAULT_FILE.name;

/** Le vault : pourquoi il existe, ce qu'il contient, et comment une clé part avec un appel sans que l'agent la voie. */
export const VAULT_LESSON: Lesson = {
  id: "vault",
  title: "Le vault",
  summary: "Les clés des services que l'agent appelle sans toi, et qu'il ne voit jamais.",
  before: {
    adds: ["agent", "room", "bench", "bed", "context"],
    actions: [
      {
        type: "newSession",
        budgetCents: null,
        context: {
          system: AGENT_SETUP.system,
          toolLines: [...AGENT_SETUP.toolLines, "create_refund : rembourse une commande (service Paiements)"],
        },
      },
    ],
  },
  files: [VAULT_FILE],
  steps: [
    {
      id: "problem",
      title: "Un secret que l'agent ne doit pas voir",
      text: [
        "Pour rembourser un client, le service Paiements exige une clé.",
        "Si tu l'écris dans les consignes de l'agent, elle entre dans sa pile : le modèle la relit à chaque tour, et pourrait la recopier.",
        "Il faut que l'appel parte avec la clé, sans que l'agent la voie.",
      ],
      code: { file: FILE, blocks: ["bad"] },
    },
    {
      id: "vault",
      title: "Un coffre, côté Anthropic",
      text: [
        "Le vault est ce coffre. Il vit chez Anthropic, à part de l'agent et hors du conteneur.",
        "Sur la scène, il est dans un coin de la pièce, loin de l'établi : l'agent passe devant, mais ne l'ouvre jamais.",
      ],
      code: { file: FILE, blocks: ["create"] },
      adds: ["vault"],
    },
    {
      id: "credential",
      title: "Une clé, liée à un service",
      text: [
        "Ici, la clé est rattachée à l'adresse d'un service : le serveur MCP de Paiements.",
        "La plateforme sait ainsi à quel appel la joindre, et seulement à celui-là.",
      ],
      code: { file: FILE, blocks: ["credential"] },
      sets: { vaultKeys: ["paiements"] },
    },
    {
      id: "attach",
      title: "Branché à la session",
      text: [
        "Le vault se branche quand ton backend ouvre la session, avec « vault_ids ».",
        "Rien d'autre ne change : ni l'agent, ni ses outils, ni ton code.",
        "Une condition, qui vient du serveur MCP déclaré sur l'agent : avec un réseau « limited », son hôte doit figurer dans « allowed_hosts » (ou l'environnement doit mettre « allow_mcp_servers » à true). Sinon, l'ouverture de la session est refusée.",
      ],
      code: { file: FILE, blocks: ["session"] },
    },
    {
      id: "ask",
      title: "L'agent demande le remboursement",
      text: [
        "Quelqu'un écrit : « Rembourse la commande de Bruno. » L'agent demande l'outil du service Paiements.",
        "La demande ne va pas vers ton backend : elle passe d'abord par le vault.",
      ],
      code: { file: FILE, blocks: ["session"] },
      actions: [
        event("user.message", "Rembourse la commande de Bruno.", "app"),
        event("session.status_running", "l'agent se met au travail", "session"),
        { type: "status", status: "running" },
        { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
        { type: "mood", mood: "waiting" },
        { type: "modelRequest" },
        event("agent.mcp_tool_use", 'paiements.create_refund({"order":"A-1042"})', "agent"),
        hop("agent", "vault", "create_refund", "call"),
      ],
    },
    {
      id: "key",
      title: "La clé part avec l'appel",
      text: [
        "La plateforme prend la clé dans le vault et la joint à l'appel, au moment où il sort de la pièce.",
        "L'agent ne l'a pas vue. Ton backend non plus : il n'est même pas sur le trajet.",
      ],
      code: { file: FILE, blocks: ["credential", "session"] },
      actions: [
        { type: "key", key: "paiements", isDenied: false },
        hop("vault", PAIEMENTS, "avec la clé", "call"),
      ],
    },
    {
      id: "result",
      title: "Le résultat revient, pas la clé",
      text: [
        "Le service rembourse et répond. Le résultat entre dans la pile de l'agent, qui conclut.",
        "Regarde la pile : la demande et le résultat y sont. La clé n'y est jamais entrée.",
      ],
      code: { file: FILE, blocks: ["session"] },
      actions: [
        hop(PAIEMENTS, "agent", "résultat", "result"),
        event("agent.mcp_tool_result", "Remboursement de 39 € émis pour Bruno.", "mcp"),
        { type: "modelRequest" },
        event("agent.message", "C'est fait : Bruno est remboursé.", "agent"),
        event("session.status_idle", "end_turn : le tour est terminé", "session"),
        { type: "status", status: "idle" },
        { type: "mood", mood: "idle" },
      ],
    },
    {
      id: "custom",
      title: "Et tes propres outils ?",
      text: [
        "Tes outils custom n'ont pas besoin du vault : ils s'exécutent dans ton backend, qui a déjà ses propres secrets.",
        "Le vault sert à une seule chose : les services que l'agent appelle sans passer par toi.",
      ],
      code: { file: FILE, blocks: ["custom"] },
      actions: [{ type: "move", to: AGENT_HOME, durationMs: WALK_MS }],
    },
    {
      id: "recap",
      title: "Tu connais les bases",
      text: [
        "L'agent : ce qu'il est. L'environnement : où il travaille. La session : une exécution, que ton backend ouvre et écoute. Le vault : les clés qu'il ne voit jamais.",
        "Managed Agents fait tourner tout cela pour toi. Ton backend garde deux rôles : démarrer les demandes, et exécuter tes outils.",
        "Les annexes sont maintenant ouvertes : chacune ajoute un sujet à ces bases.",
      ],
      code: { file: FILE, blocks: ["create", "credential", "session"] },
    },
  ],
};
