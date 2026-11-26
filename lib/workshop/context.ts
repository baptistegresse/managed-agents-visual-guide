/**
 * La fenêtre de contexte : tout ce que le modèle relit à chaque requête, et rien
 * d'autre. Les événements de statut, les points d'entrée et tes accords sont
 * destinés à ton application : ils n'y entrent jamais.
 */
export type BlockKind = "system" | "tools" | "user" | "assistant" | "tool_use" | "tool_result" | "summary";

export interface ContextBlock {
  readonly id: number;
  readonly kind: BlockKind;
  /** Le nom de l'événement qui a produit ce bloc. */
  readonly label: string;
  readonly text: string;
  readonly tokens: number;
}

export interface ContextWindow {
  readonly blocks: readonly ContextBlock[];
  readonly limit: number;
  readonly nextId: number;
  /** Nombre de requêtes au modèle depuis l'ouverture de la session. */
  readonly requestCount: number;
  /** Ce que la dernière requête a envoyé : toute la fenêtre. */
  readonly lastRequestTokens: number;
  readonly compactionCount: number;
}

/** Ce qui est écrit dans la fenêtre avant le premier message : la configuration de l'agent. */
export interface ContextSetup {
  readonly system: string;
  /** Une ligne par définition d'outil envoyée au modèle. */
  readonly toolLines: readonly string[];
}

export interface ContextEvent {
  readonly name: string;
  readonly detail: string;
}

/** Fenêtre miniature (une vraie compte des centaines de milliers de tokens), pour voir la compaction arriver. */
export const CONTEXT_LIMIT = 1500;
export const COMPACT_AT_SHARE = 0.8;
/** Les derniers blocs gardés tels quels quand le reste est résumé. */
export const KEEP_RECENT_BLOCKS = 6;
/** Ce que font les copies de l'agent reste dans leur propre fil : leurs événements portent ce préfixe, dans toutes les langues. */
export const THREAD_PREFIX = "[thread";

const CHARACTERS_PER_TOKEN = 3;
const BLOCK_OVERHEAD_TOKENS = 8;
const TOOL_SCHEMA_TOKENS = 30;
const SUMMARY_SHARE = 0.15;
const SUMMARY_MIN_TOKENS = 40;

const KIND_BY_EVENT: Readonly<Record<string, BlockKind>> = {
  "user.message": "user",
  "user.define_outcome": "user",
  "agent.message": "assistant",
  "agent.custom_tool_use": "tool_use",
  "agent.tool_use": "tool_use",
  "agent.mcp_tool_use": "tool_use",
  "user.custom_tool_result": "tool_result",
  "agent.tool_result": "tool_result",
  "agent.mcp_tool_result": "tool_result",
  // Le compte rendu d'une copie arrive dans le fil principal par ce message, et lui seul.
  "agent.thread_message_received": "tool_result",
};

const SETUP_KINDS: ReadonlySet<BlockKind> = new Set(["system", "tools"]);

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARACTERS_PER_TOKEN) + BLOCK_OVERHEAD_TOKENS;
}

function append(window: ContextWindow, kind: BlockKind, label: string, text: string, tokens: number): ContextWindow {
  return {
    ...window,
    blocks: [...window.blocks, { id: window.nextId, kind, label, text, tokens }],
    nextId: window.nextId + 1,
  };
}

/** Avant toute session : rien à lire. */
export function createContext(): ContextWindow {
  return { blocks: [], limit: CONTEXT_LIMIT, nextId: 1, requestCount: 0, lastRequestTokens: 0, compactionCount: 0 };
}

/** Une session s'ouvre : la fenêtre ne contient que les consignes et les définitions d'outils. */
export function openContext(setup: ContextSetup): ContextWindow {
  const withSystem = append(createContext(), "system", "system", setup.system, estimateTokens(setup.system));
  if (setup.toolLines.length === 0) return withSystem;
  const text = setup.toolLines.join("\n");
  return append(withSystem, "tools", "tools", text, estimateTokens(text) + setup.toolLines.length * TOOL_SCHEMA_TOKENS);
}

/** Ajoute l'événement à la fenêtre si le modèle le lit ; sinon la fenêtre revient inchangée. */
export function recordInContext(window: ContextWindow, event: ContextEvent): ContextWindow {
  const kind = KIND_BY_EVENT[event.name];
  if (!kind || event.detail.startsWith(THREAD_PREFIX)) return window;
  return append(window, kind, event.name, event.detail, estimateTokens(event.detail));
}

export function usedTokens(window: ContextWindow): number {
  return window.blocks.reduce((total, block) => total + block.tokens, 0);
}

export function needsCompaction(window: ContextWindow): boolean {
  return usedTokens(window) > window.limit * COMPACT_AT_SHARE;
}

/**
 * La plateforme résume les échanges les plus anciens pour faire de la place :
 * la configuration et les derniers blocs restent, le reste devient un résumé.
 */
export function compact(window: ContextWindow): ContextWindow {
  const setup = window.blocks.filter((block) => SETUP_KINDS.has(block.kind));
  const exchanges = window.blocks.filter((block) => !SETUP_KINDS.has(block.kind));
  if (exchanges.length <= KEEP_RECENT_BLOCKS) return window;

  const old = exchanges.slice(0, -KEEP_RECENT_BLOCKS);
  const oldTokens = old.reduce((total, block) => total + block.tokens, 0);
  const summary: ContextBlock = {
    id: window.nextId,
    kind: "summary",
    label: "summary",
    text: `summary: ${old.length} blocks, ${oldTokens} tokens`,
    tokens: Math.max(SUMMARY_MIN_TOKENS, Math.round(oldTokens * SUMMARY_SHARE)),
  };
  return {
    ...window,
    blocks: [...setup, summary, ...exchanges.slice(-KEEP_RECENT_BLOCKS)],
    nextId: window.nextId + 1,
    compactionCount: window.compactionCount + 1,
  };
}

/** Une requête au modèle : il est sans mémoire, donc toute la fenêtre lui est renvoyée. */
export function markRequest(window: ContextWindow): ContextWindow {
  return { ...window, requestCount: window.requestCount + 1, lastRequestTokens: usedTokens(window) };
}
