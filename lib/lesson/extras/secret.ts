import { event } from "@/lib/workshop/effects";
import { WORKBENCH_STAND } from "@/lib/workshop/layout";
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
  WALK_MS,
} from "./shared";

const SYSTEM =
  "Tu réponds aux clients du support. Pour suivre un colis, appelle l'API du transporteur avec curl : la clé est dans la variable TRANSPORTEUR_API_KEY.";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "environment",
      lines: [
        "// Premier verrou : l'environnement laisse sortir vers ce site, et lui seul.",
        "const environment = await client.beta.environments.create({",
        '  name: "support",',
        "  config: {",
        '    type: "cloud",',
        '    networking: { type: "limited", allowed_hosts: ["api.transporteur.example"] },',
        "  },",
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
        "  // Les consignes citent le nom de la variable. Jamais la clé.",
        `  system: ${JSON.stringify(SYSTEM)},`,
        "  // bash s'exécute dans le conteneur : c'est de là que curl partira.",
        '  tools: [REPLY_TICKET_TOOL, { type: "agent_toolset_20260401" }],',
        "});",
        "",
      ],
    },
    {
      id: "vault",
      lines: ['const vault = await client.beta.vaults.create({ display_name: "Clés du support" });', ""],
    },
    {
      id: "credential",
      lines: [
        "// Une clé pour le conteneur : un nom de variable, et les sites où elle a le droit d'aller.",
        "await client.beta.vaults.credentials.create(vault.id, {",
        '  display_name: "Clé Transporteur",',
        "  auth: {",
        '    type: "environment_variable",',
        '    secret_name: "TRANSPORTEUR_API_KEY", // le nom que verra le conteneur',
        '    secret_value: requireEnv("TRANSPORTEUR_API_KEY"), // la vraie clé, lue chez toi',
        "    // Second verrou : la clé n'accompagne que les requêtes vers ce site.",
        '    networking: { type: "limited", allowed_hosts: ["api.transporteur.example"] },',
        "    // Et seulement dans leurs en-têtes.",
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
        "    // Le vault qui contient la clé du transporteur.",
        "    vault_ids: [VAULT_ID],",
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-builtin",
      lines: [
        "    // bash est un outil intégré : il passe dans le flux, mais tu n'as rien à renvoyer.",
        '    if (event.type === "agent.tool_use") logStep(event.name, event.input);',
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

const CURL = 'curl -H "Authorization: Bearer $TRANSPORTEUR_API_KEY" https://api.transporteur.example/colis/AB123';
const TRACKING = "Colis AB123 : en cours de livraison, arrivée prévue demain.";
const CARRIER = "service:transporteur";

/** Un appel réseau lancé depuis le conteneur : la clé du vault est posée à la sortie, jamais dans le conteneur. */
export const SECRET_LESSON: Lesson = {
  id: "secret",
  title: "Un secret pour le conteneur",
  summary: "L'agent appelle une API avec curl : le conteneur ne voit qu'un nom de variable, la clé est posée à la sortie.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "need",
      title: "Une API sans serveur MCP",
      text: [
        "Le transporteur n'a pas de serveur MCP : seulement une API, qu'on appelle avec une clé dans un en-tête.",
        "L'agent peut l'appeler lui-même, avec curl, depuis le conteneur : l'établi, au fond de la pièce.",
        "Reste la clé. Écrite dans les consignes ou dans un message, elle resterait dans l'historique de la session.",
      ],
      code: { file: SETUP, blocks: ["agent"] },
      adds: ["bench"],
      session: {
        system: SYSTEM,
        extraToolLines: ["bash, read, write, edit, glob, grep : exécutés dans le conteneur de la session"],
      },
    }),
    {
      id: "credential",
      title: "Une clé rangée sous un nom de variable",
      text: [
        "Le vault accepte un second type de clé : « environment_variable ». Tu donnes un nom de variable, la vraie valeur, et les sites où elle a le droit d'aller.",
        "Deux verrous doivent s'ouvrir : l'environnement laisse sortir vers ce site, et la clé n'accompagne que les requêtes vers ce site.",
      ],
      code: { file: SETUP, blocks: ["environment", "vault", "credential"] },
      sets: { vaultKeys: ["transporteur"] },
    },
    {
      id: "curl",
      title: "Dans le conteneur : un nom, pas la clé",
      text: [
        "Ton backend demande où en est le colis d'Alice. L'agent lance curl avec « bash », en citant la variable.",
        "Dans le conteneur, cette variable ne contient qu'un jeton de remplacement, sans valeur. Même en l'affichant, l'agent ne verrait pas la clé.",
      ],
      code: { file: ROUTE, blocks: ["session"] },
      actions: [
        ...userMessage("Où en est le colis AB123 d'Alice ?"),
        event("agent.tool_use", `bash : ${CURL}`, "agent"),
        { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
        { type: "terminal", lines: [`$ ${CURL}`] },
      ],
    },
    {
      id: "egress",
      title: "La vraie clé est posée à la sortie",
      text: [
        "La requête quitte le conteneur. À la sortie, Anthropic prend la clé dans le vault et la met à la place du jeton, parce que le site est bien celui que tu as autorisé.",
        "Vers un autre site, aucun remplacement : la clé ne peut pas partir ailleurs.",
      ],
      code: { file: SETUP, blocks: ["credential"] },
      actions: [
        { type: "key", key: "transporteur", isDenied: false },
        hop("agent", CARRIER, "avec la clé", "call"),
      ],
    },
    {
      id: "result",
      title: "La réponse revient, sans passer par toi",
      text: [
        "Le transporteur répond. Le résultat revient dans le conteneur, puis dans la pile avec « agent.tool_result ».",
        "Ton backend voit passer les deux événements dans le flux. Il n'a rien exécuté, et n'a rien à renvoyer.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-builtin"] },
      actions: [
        hop(CARRIER, "agent", "résultat", "result"),
        { type: "terminal", lines: [`$ ${CURL}`, TRACKING] },
        event("agent.tool_result", TRACKING, "sandbox"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "limits",
      title: "Ce que le vault ne fait pas à ta place",
      text: [
        "L'agent donne la réponse, et le tour se termine. La clé n'est entrée ni dans la pile, ni dans le conteneur.",
        "Le remplacement ne se fait qu'à la sortie, dans les en-têtes ou le corps d'une requête. Ce qui revient n'est pas masqué : si le service renvoie un autre secret, un jeton de session par exemple, il arrive en clair dans le conteneur.",
        "Retiens les trois chemins d'une clé : ton backend pour tes outils, le vault pour un serveur MCP, le vault encore pour le conteneur.",
      ],
      code: { file: SETUP, blocks: ["credential"] },
      actions: [...agentReply("Le colis d'Alice est en cours de livraison : il arrive demain."), ...BACK_TO_BED],
    },
  ],
};
