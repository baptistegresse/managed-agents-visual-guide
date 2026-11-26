import { AGENT_MODEL, APP_TOOLS, keySpec, mcpUrl, REPLY_TONES, TOOL_CATALOG, type KeyId, type ToolId } from "./catalog";
import { goalDescription, DEFAULT_GOAL } from "./outcome";
import { ROUND_MESSAGE } from "./reaction";
import { ALLOWED_DOMAIN, PLAN_FILE } from "./requests";
import type { StepId, WorkshopState } from "./state";
import type { EntryPoint } from "./timeline";

function quote(text: string): string {
  return JSON.stringify(text);
}

function environmentSnippet(state: WorkshopState): string {
  return `const environment = await client.beta.environments.create({
  name: ${quote(state.environment.name)},
  config: {
    type: "cloud",
    networking: { type: ${quote(state.environment.networking)} },
  },
});`;
}

function vaultSnippet(state: WorkshopState): string {
  const vault = `const vault = await client.beta.vaults.create({
  display_name: "Clés du support",
});`;
  if (state.vault.keys.length === 0) return `${vault}\n\n// Aucune clé pour l'instant : le vault reste vide.`;

  const credentials = state.vault.keys.map((id) => {
    const key = keySpec(id);
    return `// L'identifiant du service ${key.service} : rattaché à l'adresse de son serveur MCP.
// La plateforme le joint à l'appel ; l'agent ne le voit jamais.
await client.beta.vaults.credentials.create(vault.id, {
  display_name: ${quote(key.label)},
  auth: {
    type: "static_bearer",
    mcp_server_url: ${quote(mcpUrl(id))},
    token: process.env.${key.secretName},
  },
});`;
  });
  return [vault, ...credentials].join("\n\n");
}

/** Les services tiers branchés à l'agent : ceux dont il a reçu un outil. */
function connectedServices(state: WorkshopState): KeyId[] {
  const owners = TOOL_CATALOG.filter((tool) => state.tools.enabled.includes(tool.id)).flatMap((tool) =>
    tool.requiresKey ? [tool.requiresKey] : [],
  );
  return [...new Set<KeyId>(owners)];
}

/** Un service dont un outil est en « always_ask » garde la politique par défaut : chaque appel attend ton accord. */
function needsApproval(key: KeyId): boolean {
  return TOOL_CATALOG.some((tool) => tool.requiresKey === key && tool.needsApproval);
}

/** Chaque outil custom vise un ticket par son numéro ; la réponse peut préciser le ton. */
function toolProperties(id: ToolId): string {
  const tone = id === "reply_ticket" ? `, tone: { type: "string", enum: [${REPLY_TONES.map(quote).join(", ")}] }` : "";
  return `{ ticket: { type: "integer", minimum: 1 }${tone} }`;
}

function toolsSnippet(state: WorkshopState): string {
  const tools = APP_TOOLS.filter((tool) => state.tools.enabled.includes(tool.id)).map(
    (tool) => `  {
    type: "custom",
    name: ${quote(tool.id)},
    description: ${quote(tool.description)},
    input_schema: {
      type: "object",
      properties: ${toolProperties(tool.id)},
      required: ["ticket"],
    },
  },`,
  );
  const sandbox =
    state.tools.sandbox === "off"
      ? []
      : [
          `  // Le bac à sable : bash et fichiers, exécutés dans le conteneur, chez Anthropic.
  {
    type: "agent_toolset_20260401",
    default_config: { enabled: true, permission_policy: { type: ${quote(state.tools.sandbox)} } },
    configs: [
${
  state.tools.hasWeb
    ? `      // Les outils web tournent chez Anthropic ; ils ne voient que les domaines listés.
      { name: "web_search", enabled: true, allowed_domains: [${quote(ALLOWED_DOMAIN)}] },
      { name: "web_fetch", enabled: true, allowed_domains: [${quote(ALLOWED_DOMAIN)}] },`
    : `      { name: "web_fetch", enabled: false },
      { name: "web_search", enabled: false },`
}
    ],
  },
  // Des outils "custom" : l'agent décide de les appeler, ton application les exécute.`,
        ];
  const services = connectedServices(state);
  const mcp = services.map((key) =>
    needsApproval(key)
      ? `  { type: "mcp_toolset", mcp_server_name: ${quote(key)} }, // politique par défaut : chaque appel attend ton accord`
      : `  { type: "mcp_toolset", mcp_server_name: ${quote(key)}, default_config: { permission_policy: { type: "always_allow" } } },`,
  );
  const mcpIntro =
    services.length > 0
      ? ["  // Les outils des services tiers : la plateforme les appelle par MCP, sans passer par ton application."]
      : [];
  return `const tools = [\n${[...sandbox, ...tools, ...mcpIntro, ...mcp].join("\n")}\n];`;
}

function agentSnippet(state: WorkshopState): string {
  return `const agent = await client.beta.agents.create({
  name: ${quote(state.agent.name)},
  model: ${quote(AGENT_MODEL)},
  system: ${quote(state.agent.system)},
  tools, // ceux de l'étape précédente${
    connectedServices(state).length > 0
      ? `
  // Les serveurs des services tiers ; leurs identifiants, eux, sont dans le vault.
  mcp_servers: [
${connectedServices(state)
  .map((key) => `    { type: "url", name: ${quote(key)}, url: ${quote(mcpUrl(key))} },`)
  .join("\n")}
  ],`
      : ""
  }${
    state.agent.hasSkill
      ? `
  // Un savoir-faire que l'agent ne charge que quand la tâche le demande.
  skills: [{ type: "custom", skill_id: "skill_remboursement", version: "latest" }],`
      : ""
  }${
    state.agent.canDelegate
      ? `
  // Il peut confier une partie du travail à des copies de lui-même.
  multiagent: {
    type: "multiagent_20261001",
    subagents: { type: "enabled", predefined_agents: [{ type: "self" }] },
    workflows: { type: "disabled" },
  },`
      : ""
  }
});`;
}

function sessionSnippet(state: WorkshopState): string {
  const { budgetCents, hasMemory, hasPlan } = state.session;
  const upload = hasPlan
    ? `// Un fichier à monter dans le conteneur au démarrage (un dépôt GitHub se monte de la même façon).
const faq = await client.files.upload({ file: fs.createReadStream(${quote(PLAN_FILE)}) });

`
    : "";
  const mounted = [
    ...(hasPlan ? [`{ type: "file", file_id: faq.id, mount_path: ${quote(`/mnt/${PLAN_FILE}`)} }`] : []),
    ...(hasMemory ? [`{ type: "memory_store", memory_store_id: store.id, access: "read_write" }`] : []),
  ];
  const pinnedAgent =
    state.agent.version > 1 ? `{ type: "agent", id: agent.id, version: ${state.agent.version} }` : "agent.id";
  const store = hasMemory
    ? `// Le carnet de mémoire : un dossier monté dans le conteneur, qui survit aux sessions.
const store = await client.beta.memoryStores.create({
  name: "Carnet du support",
  description: "Le ton à employer avec les clients.",
});

`
    : "";
  const budget =
    budgetCents === null
      ? ""
      : `
  budget: { type: "limit", max_list_cost: { amount: ${quote(String(budgetCents))}, currency: "USD" } },`;
  const resources =
    mounted.length > 0
      ? `
  resources: [
${mounted.map((resource) => `    ${resource},`).join("\n")}
  ],`
      : "";
  return `${upload}${store}const session = await client.beta.sessions.create({
  agent: ${pinnedAgent},
  environment_id: environment.id,
  vault_ids: [vault.id],${budget}${resources}
});

// Chaque consigne est un événement envoyé à la session.
await client.beta.sessions.events.send(session.id, {
  events: [
    { type: "user.message", content: [{ type: "text", text: "…" }] },
  ],
});`;
}

/** Le vrai appel au SDK qui correspond à l'étape, rempli avec les choix du visiteur. */
export function snippetFor(step: StepId, state: WorkshopState): string {
  switch (step) {
    case "environment":
      return environmentSnippet(state);
    case "vault":
      return vaultSnippet(state);
    case "tools":
      return toolsSnippet(state);
    case "agent":
      return agentSnippet(state);
    case "session":
      return sessionSnippet(state);
  }
}

const ENTRY_SNIPPETS: Readonly<Record<EntryPoint, string>> = {
  api: `// Point d'entrée 1 : un appel API.
// Un bouton de ton interface appelle ta route, qui écrit dans la session.
export async function POST(request: Request) {
  const { message } = await request.json();

  await client.beta.sessions.events.send(sessionId, {
    events: [
      { type: "user.message", content: [{ type: "text", text: message }] },
    ],
  });
  return Response.json({ success: true });
}`,
  webhook: `// Point d'entrée 2 : un webhook.
// La boîte de support (un système extérieur) appelle ton serveur quand un
// client écrit. Personne n'a cliqué : l'agent est réveillé par le ticket.
export async function POST(request: Request) {
  const ticket = await verifySignature(request); // vérifie la signature de l'expéditeur

  await client.beta.sessions.events.send(sessionId, {
    events: [
      { type: "user.message", content: [{ type: "text", text: describe(ticket) }] },
    ],
  });
  return new Response(null, { status: 204 });
}`,
  cron: `// Point d'entrée 3 : un cron.
// Un déploiement planifié : la plateforme ouvre elle-même une session à
// chaque échéance, sans que ton serveur ait à tourner.
const deployment = await client.beta.deployments.create({
  name: "Relance du support",
  agent: agent.id,
  environment_id: environment.id,
  vault_ids: [vault.id],
  initial_events: [
    {
      type: "user.message",
      content: [{ type: "text", text: ${quote(ROUND_MESSAGE)} }],
    },
  ],
  schedule: { type: "cron", expression: "*/10 * * * *", timezone: "Europe/Paris" },
});`,
};

/** Le code qui se cache derrière un point d'entrée. */
export function entrySnippet(point: EntryPoint): string {
  return ENTRY_SNIPPETS[point];
}

export type Moment = "approval" | "budget" | "outcome" | "version" | "error";

const MOMENT_SNIPPETS: Readonly<Record<Moment, string>> = {
  approval: `// Un appel attend ton accord (un outil du bac à sable, ou le remboursement
// du service Paiements) : la session est "idle", avec stop_reason
// "requires_action". Tu réponds par un événement.
await client.beta.sessions.events.send(session.id, {
  events: [
    { type: "user.tool_confirmation", tool_use_id: toolUse.id, result: "allow" }, // ou "deny"
  ],
});`,
  budget: `// Budget atteint : la session est en pause (stop_reason "budget_reached"),
// rien n'est perdu. Relever le plafond la relance toute seule.
await client.beta.sessions.update(session.id, {
  budget: { type: "limit", max_list_cost: { amount: "20", currency: "USD" } },
});`,
  outcome: `// Un objectif : tu décris ce que "terminé" veut dire, avec un barème.
// Un correcteur séparé note chaque essai et renvoie l'agent corriger.
await client.beta.sessions.events.send(session.id, {
  events: [
    {
      type: "user.define_outcome",
      description: ${quote(goalDescription(DEFAULT_GOAL))},
      rubric: { type: "text", content: BAREME },
      max_iterations: 3,
    },
  ],
});`,
  version: `// Modifier un agent crée une nouvelle version. Les sessions déjà ouvertes
// gardent la leur ; les suivantes prennent la dernière, ou celle que tu épingles.
const updated = await client.beta.agents.update(agent.id, { tools });
console.log(updated.version); // 2

const session = await client.beta.sessions.create({
  agent: { type: "agent", id: agent.id, version: updated.version },
  environment_id: environment.id,
});`,
  error: `// Une panne arrive dans le flux comme un événement, pas comme une exception.
for await (const event of stream) {
  if (event.type === "session.error") {
    // Souvent passagère : la plateforme réessaie d'elle-même.
    console.error(event.error.type, event.error.message);
  }
  if (event.type === "session.status_rescheduled") {
    // Rien à faire : la session est replanifiée et reprendra.
  }
  if (event.type === "session.status_terminated") {
    break; // Définitif : il faut ouvrir une nouvelle session.
  }
}`,
};

/** Le code d'un moment particulier de la session : accord attendu, budget atteint, objectif fixé. */
export function momentSnippet(moment: Moment): string {
  return MOMENT_SNIPPETS[moment];
}
