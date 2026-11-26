import { createAnthropicGateway } from "@/lib/agents/anthropicGateway";
import type { SessionGateway } from "@/lib/agents/gateway";
import { createAgentRunner } from "@/lib/agents/runner";
import { createSimulatedGateway } from "@/lib/agents/simulatedGateway";
import type { ArenaServices } from "@/lib/arena/join";
import { LIMITS } from "@/lib/config";
import { createStore } from "@/lib/world/store";
import { createWorld } from "@/lib/world/world";

export type ArenaMode = "live" | "simulation" | "unconfigured";

export interface Arena extends ArenaServices {
  readonly mode: ArenaMode;
}

function reportError(context: string, error: unknown): void {
  console.error(`[arène] ${context}`, error);
}

const UNCONFIGURED_GATEWAY: SessionGateway = {
  createSession: async () => {
    throw new Error("Arène non configurée");
  },
  events: () => {
    throw new Error("Arène non configurée");
  },
  sendMessage: async () => undefined,
  sendToolResult: async () => undefined,
  interrupt: async () => undefined,
  getCostCents: async () => null,
};

function resolveGateway(): { mode: ArenaMode; gateway: SessionGateway } {
  if (process.env.ARENA_SIMULATION === "1") {
    return { mode: "simulation", gateway: createSimulatedGateway() };
  }
  const agentId = process.env.ARENA_AGENT_ID;
  const environmentId = process.env.ARENA_ENVIRONMENT_ID;
  if (!agentId || !environmentId) return { mode: "unconfigured", gateway: UNCONFIGURED_GATEWAY };
  return { mode: "live", gateway: createAnthropicGateway({ agentId, environmentId }) };
}

function createArena(): Arena {
  const { mode, gateway } = resolveGateway();
  const store = createStore(createWorld());
  const now = (): number => Date.now();
  const runner = createAgentRunner({ store, gateway, limits: LIMITS, now, reportError });
  return { mode, store, runner, isReady: mode !== "unconfigured", now, reportError };
}

const globalArena = globalThis as typeof globalThis & { __arena?: Arena };

/**
 * Le monde vit en mémoire dans le processus Node : une seule instance, conservée
 * sur globalThis pour survivre au rechargement à chaud en développement.
 */
export function getArena(): Arena {
  globalArena.__arena ??= createArena();
  return globalArena.__arena;
}
