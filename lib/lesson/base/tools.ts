import { AGENT_DESK, AGENT_HOME, WORKBENCH_STAND } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../types";
import { WALK_MS } from "./session";

const AGENT_FILE: CodeFile = {
  name: "agent.ts",
  blocks: [
    {
      id: "custom",
      lines: [
        "// Un outil custom : un nom, une description, ce qu'il faut lui fournir.",
        "const replyTicket = {",
        '  type: "custom",',
        '  name: "reply_ticket",',
        '  description: "Envoie une réponse au client et résout son ticket.",',
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
        "// Les outils intégrés. Commandes et fichiers tournent dans le conteneur ;",
        "// la recherche web tourne sur les serveurs d'Anthropic.",
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
        "// Les outils d'un service tiers, exposés par son serveur MCP.",
        "// Par défaut, chacun attend ton accord avant de partir. Ici, on les autorise d'office.",
        "const paiements = {",
        '  type: "mcp_toolset",',
        '  mcp_server_name: "paiements",',
        '  default_config: { permission_policy: { type: "always_allow" } },',
        "};",
        "",
      ],
    },
    {
      id: "agent",
      lines: [
        "// L'agent : un modèle, des consignes, et la liste de ses outils.",
        "const agent = await client.beta.agents.create({",
        '  name: "Assistant support",',
        '  model: "claude-haiku-5-5",',
        '  system: "Tu réponds aux clients du support.",',
        "  tools: [replyTicket, toolset, paiements],",
        '  mcp_servers: [{ type: "url", name: "paiements", url: "https://paiements.example/mcp" }],',
        "});",
        "",
      ],
    },
    {
      id: "save",
      lines: ["// Une configuration, enregistrée une fois.", 'await saveId("AGENT_ID", agent.id);'],
    },
  ],
};

const FILE = AGENT_FILE.name;

/** Les outils : ce qu'est un outil, qui l'exécute selon sa famille, et l'objet « agent » qui les réunit. */
export const TOOLS_LESSON: Lesson = {
  id: "tools",
  title: "Les outils",
  summary: "Ce que l'agent a le droit de demander, et qui exécute chaque demande.",
  before: { adds: ["agent", "room", "bench"], actions: [{ type: "move", to: AGENT_DESK, durationMs: 0 }] },
  files: [AGENT_FILE],
  steps: [
    {
      id: "what",
      title: "Un outil, c'est une action décrite",
      text: [
        "Un outil tient en trois choses : un nom, une description, et la forme des informations à lui fournir.",
        "Le modèle lit la description pour savoir quand s'en servir. Plus elle est claire, mieux il choisit.",
      ],
      code: { file: FILE, blocks: ["custom"] },
    },
    {
      id: "ask",
      title: "L'agent demande, il n'exécute pas",
      text: [
        "Quand le modèle veut agir, il n'agit pas : il écrit une demande d'outil, avec les informations remplies.",
        "La question est donc toujours la même : qui exécute ? Il y a trois réponses possibles.",
      ],
      code: { file: FILE, blocks: ["custom"] },
      actions: [
        { type: "mood", mood: "waiting" },
        hop("agent", "app", "reply_ticket", "call"),
      ],
    },
    {
      id: "custom",
      title: "Outil custom : ton backend l'exécute",
      text: [
        "La demande sort de la pièce vers chez toi. Ton code agit, puis renvoie le résultat à l'agent.",
        "C'est le bon choix pour tout ce qui touche à tes données : ta base, ta boîte de support, tes clients.",
      ],
      code: { file: FILE, blocks: ["custom"] },
      actions: [
        { type: "mood", mood: "thinking" },
        hop("app", "agent", "résultat", "result"),
      ],
    },
    {
      id: "builtin",
      title: "Outils intégrés : le conteneur les exécute",
      text: [
        "Anthropic fournit des outils tout faits : lancer une commande, lire et écrire des fichiers, chercher sur le web.",
        "Les commandes et les fichiers s'exécutent dans le conteneur de la session : l'agent va à son établi. La recherche web, elle, tourne sur les serveurs d'Anthropic. Dans les deux cas, rien ne passe par ton backend. Avec un réseau « limited », la recherche web est filtrée elle aussi : elle ne renvoie que les résultats des hôtes autorisés.",
      ],
      code: { file: FILE, blocks: ["builtin"] },
      actions: [
        { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
        { type: "terminal", lines: ["$ ls /workspace", "rapport.md"] },
      ],
    },
    {
      id: "mcp",
      title: "Outils d'un service tiers : MCP",
      text: [
        "Un service extérieur, un prestataire de paiement par exemple, peut proposer ses propres outils par un serveur MCP.",
        "La plateforme l'appelle directement. La demande sort de la pièce par la droite, sans passer par ton backend.",
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
      title: "L'agent, c'est cette liste",
      text: [
        "L'objet « agent » réunit le modèle, ses consignes et ses outils. C'est une configuration, enregistrée une fois.",
        "Le modifier crée une nouvelle version. Et tant qu'aucune session ne tourne, il ne fait rien : il dort.",
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
