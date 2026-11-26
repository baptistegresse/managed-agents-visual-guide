import { TOOL_CATALOG, type KeyId, type ToolId } from "./catalog";
import type { SandboxPolicy } from "./effects";

export const STEPS = ["environment", "vault", "tools", "agent", "session"] as const;
export type StepId = (typeof STEPS)[number];

export type Networking = "limited" | "unrestricted";

export interface WorkshopState {
  readonly environment: { readonly name: string; readonly networking: Networking; readonly id: string | null };
  readonly vault: { readonly keys: readonly KeyId[]; readonly id: string | null };
  readonly tools: {
    readonly enabled: readonly ToolId[];
    readonly isConfirmed: boolean;
    /** Les outils intégrés du conteneur (bash, fichiers) et leur politique d'approbation. */
    readonly sandbox: SandboxPolicy;
    /** Les outils web (recherche, lecture de page), limités à un domaine autorisé. */
    readonly hasWeb: boolean;
  };
  readonly agent: {
    readonly name: string;
    readonly system: string;
    readonly id: string | null;
    /** Peut-il confier un gros travail à des copies de lui-même ? */
    readonly canDelegate: boolean;
    /** A-t-il le skill « remboursement » ? */
    readonly hasSkill: boolean;
    /** Numéro de version : 0 tant qu'il n'existe pas, puis +1 à chaque modification. */
    readonly version: number;
  };
  readonly session: {
    readonly id: string | null;
    /** Plafond de dépense, en centimes ; `null` sans limite. */
    readonly budgetCents: number | null;
    /** Un carnet de mémoire est-il attaché à la session ? */
    readonly hasMemory: boolean;
    /** La FAQ du support est-elle montée comme fichier dans le conteneur ? */
    readonly hasPlan: boolean;
    /** La configuration d'agent sur laquelle la session a démarré : elle n'en change plus. */
    readonly config: AgentConfig | null;
    readonly agentVersion: number | null;
    /** Nombre de sessions ouvertes jusqu'ici. */
    readonly count: number;
  };
}

/** Ce qui définit une version d'agent : ses outils, ses options. */
export interface AgentConfig {
  readonly enabledTools: readonly ToolId[];
  readonly sandbox: SandboxPolicy;
  readonly canDelegate: boolean;
  readonly hasSkill: boolean;
  readonly hasWeb: boolean;
}

export type WorkshopAction =
  | { readonly type: "environmentEdited"; readonly name: string; readonly networking: Networking }
  | { readonly type: "environmentCreated"; readonly id: string }
  | { readonly type: "keyToggled"; readonly key: KeyId }
  | { readonly type: "vaultCreated"; readonly id: string }
  | { readonly type: "toolToggled"; readonly tool: ToolId }
  | { readonly type: "toolsConfirmed" }
  | { readonly type: "agentEdited"; readonly name: string; readonly system: string }
  | { readonly type: "agentCreated"; readonly id: string }
  | { readonly type: "sessionStarted"; readonly id: string }
  | { readonly type: "sandboxChosen"; readonly policy: SandboxPolicy }
  | { readonly type: "delegationToggled" }
  | { readonly type: "budgetChosen"; readonly cents: number | null }
  | { readonly type: "memoryToggled" }
  | { readonly type: "sessionRestarted"; readonly id: string }
  | { readonly type: "sessionEnded" }
  | { readonly type: "webToggled" }
  | { readonly type: "skillToggled" }
  | { readonly type: "planToggled" }
  | { readonly type: "agentRevised"; readonly config: AgentConfig }
  | { readonly type: "reset" };

const DEFAULT_AGENT_NAME = "Assistant support";
const DEFAULT_SYSTEM =
  "Tu réponds aux clients du support. Tu es précis et courtois, et tu n'utilises que les outils qu'on t'a donnés.";

export function createWorkshop(): WorkshopState {
  return {
    environment: { name: "atelier", networking: "limited", id: null },
    vault: { keys: [], id: null },
    tools: {
      enabled: TOOL_CATALOG.filter((tool) => tool.isEnabledByDefault).map((tool) => tool.id),
      isConfirmed: false,
      sandbox: "off",
      hasWeb: false,
    },
    agent: { name: DEFAULT_AGENT_NAME, system: DEFAULT_SYSTEM, id: null, canDelegate: false, hasSkill: false, version: 0 },
    session: {
      id: null,
      budgetCents: null,
      hasMemory: false,
      hasPlan: false,
      config: null,
      agentVersion: null,
      count: 0,
    },
  };
}

export function agentConfig(state: WorkshopState): AgentConfig {
  return {
    enabledTools: state.tools.enabled,
    sandbox: state.tools.sandbox,
    canDelegate: state.agent.canDelegate,
    hasSkill: state.agent.hasSkill,
    hasWeb: state.tools.hasWeb,
  };
}

/** Une session s'accroche à la version d'agent du moment où elle démarre. */
function pinned(state: WorkshopState, id: string): WorkshopState["session"] {
  return {
    ...state.session,
    id,
    config: agentConfig(state),
    agentVersion: state.agent.version,
    count: state.session.count + 1,
  };
}

/** L'étape en cours est la première qui n'est pas encore faite. */
export function currentStep(state: WorkshopState): StepId {
  if (!state.environment.id) return "environment";
  if (!state.vault.id) return "vault";
  if (!state.tools.isConfirmed) return "tools";
  if (!state.agent.id) return "agent";
  return "session";
}

export function isStepDone(state: WorkshopState, step: StepId): boolean {
  if (step === "session") return state.session.id !== null;
  return STEPS.indexOf(step) < STEPS.indexOf(currentStep(state));
}

function toggle<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((candidate) => candidate !== item) : [...items, item];
}

/** Chaque action n'a d'effet que pendant l'étape qui la concerne. */
export function workshopReducer(state: WorkshopState, action: WorkshopAction): WorkshopState {
  if (action.type === "reset") return createWorkshop();
  const step = currentStep(state);

  switch (action.type) {
    case "environmentEdited":
      if (step !== "environment") return state;
      return { ...state, environment: { name: action.name, networking: action.networking, id: null } };
    case "environmentCreated":
      if (step !== "environment") return state;
      return { ...state, environment: { ...state.environment, id: action.id } };
    case "keyToggled":
      // Un vault se complète à tout moment : il est consulté au moment de l'appel.
      if (step !== "vault" && !state.vault.id) return state;
      return { ...state, vault: { ...state.vault, keys: toggle(state.vault.keys, action.key) } };
    case "vaultCreated":
      if (step !== "vault") return state;
      return { ...state, vault: { ...state.vault, id: action.id } };
    case "toolToggled":
      if (step !== "tools") return state;
      return { ...state, tools: { ...state.tools, enabled: toggle(state.tools.enabled, action.tool) } };
    case "toolsConfirmed":
      if (step !== "tools" || state.tools.enabled.length === 0) return state;
      return { ...state, tools: { ...state.tools, isConfirmed: true } };
    case "agentEdited":
      if (step !== "agent") return state;
      return { ...state, agent: { ...state.agent, name: action.name, system: action.system } };
    case "agentCreated":
      if (step !== "agent") return state;
      return { ...state, agent: { ...state.agent, id: action.id, version: 1 } };
    case "sessionStarted":
      if (step !== "session" || state.session.id) return state;
      return { ...state, session: pinned(state, action.id) };
    case "sandboxChosen":
      if (step !== "tools") return state;
      return { ...state, tools: { ...state.tools, sandbox: action.policy } };
    case "delegationToggled":
      if (step !== "agent") return state;
      return { ...state, agent: { ...state.agent, canDelegate: !state.agent.canDelegate } };
    case "budgetChosen":
      if (step !== "session" || state.session.id) return state;
      return { ...state, session: { ...state.session, budgetCents: action.cents } };
    case "memoryToggled":
      // La mémoire est un dossier monté dans le conteneur : il faut les outils de fichiers pour la lire.
      if (step !== "session" || state.session.id || state.tools.sandbox === "off") return state;
      return { ...state, session: { ...state.session, hasMemory: !state.session.hasMemory } };
    case "sessionRestarted":
      if (!state.session.id) return state;
      return { ...state, session: pinned(state, action.id) };
    case "sessionEnded":
      // La session se ferme ; ses réglages restent modifiables avant d'en ouvrir une autre.
      if (!state.session.id) return state;
      return { ...state, session: { ...state.session, id: null, config: null, agentVersion: null } };
    case "webToggled":
      // Les outils web font partie de la boîte à outils intégrée : sans elle, ils n'existent pas.
      if (step !== "tools" || state.tools.sandbox === "off") return state;
      return { ...state, tools: { ...state.tools, hasWeb: !state.tools.hasWeb } };
    case "skillToggled":
      // Un skill est un dossier que l'agent lit à la demande : il lui faut les outils de fichiers.
      if (step !== "agent" || state.tools.sandbox === "off") return state;
      return { ...state, agent: { ...state.agent, hasSkill: !state.agent.hasSkill } };
    case "planToggled":
      if (step !== "session" || state.session.id || state.tools.sandbox === "off") return state;
      return { ...state, session: { ...state.session, hasPlan: !state.session.hasPlan } };
    case "agentRevised": {
      // Modifier un agent crée une nouvelle version ; la session en cours garde la sienne.
      if (!state.agent.id || action.config.enabledTools.length === 0) return state;
      if (JSON.stringify(action.config) === JSON.stringify(agentConfig(state))) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          enabled: action.config.enabledTools,
          sandbox: action.config.sandbox,
          hasWeb: action.config.hasWeb,
        },
        agent: {
          ...state.agent,
          canDelegate: action.config.canDelegate,
          hasSkill: action.config.hasSkill,
          version: state.agent.version + 1,
        },
      };
    }
  }
}
