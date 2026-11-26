import { z } from "zod";
import { LIMITS } from "@/lib/config";
import type { AgentRunner } from "@/lib/agents/runner";
import type { WorldStore } from "@/lib/world/store";
import type { Tenant } from "@/lib/world/types";
import { activeTenants, addTenant, findActiveTenantByVisitor, logActivity } from "@/lib/world/world";

export const joinInput = z.object({
  name: z.string().trim().min(1).max(LIMITS.nameMaxLength),
  mission: z.string().trim().min(1).max(LIMITS.missionMaxLength),
});

export interface ArenaServices {
  readonly store: WorldStore;
  readonly runner: AgentRunner;
  readonly isReady: boolean;
  readonly now: () => number;
  readonly reportError: (context: string, error: unknown) => void;
}

export type JoinResult =
  | { readonly ok: true; readonly slot: number }
  | { readonly ok: false; readonly status: number; readonly error: string };

function refuse(status: number, error: string): JoinResult {
  return { ok: false, status, error };
}

/** Fait entrer l'agent d'un visiteur dans l'arène : un seul agent actif par visiteur. */
export async function joinArena(arena: ArenaServices, visitorId: string, body: unknown): Promise<JoinResult> {
  if (!arena.isReady) {
    return refuse(503, "L'arène n'est pas configurée : lance `pnpm setup:agent`, ou démarre en mode simulation.");
  }
  const parsed = joinInput.safeParse(body);
  if (!parsed.success) {
    return refuse(
      400,
      `Donne un nom (${LIMITS.nameMaxLength} caractères max) et une mission (${LIMITS.missionMaxLength} max).`,
    );
  }

  const added = arena.store.transact<Tenant | "already_in" | "full">((world) => {
    if (findActiveTenantByVisitor(world, visitorId)) return { world, result: "already_in" as const };
    if (activeTenants(world).length >= LIMITS.maxActiveAgents) return { world, result: "full" as const };
    const { world: next, tenant } = addTenant(world, { visitorId, ...parsed.data });
    return {
      world: logActivity(
        next,
        { slot: tenant.slot, source: "server", text: `${tenant.name} rejoint l'arène` },
        arena.now(),
      ),
      result: tenant,
    };
  });

  if (added === "already_in") return refuse(409, "Tu as déjà un agent actif dans l'arène.");
  if (added === "full") {
    return refuse(429, `L'arène est pleine (${LIMITS.maxActiveAgents} agents actifs). Réessaie plus tard.`);
  }

  try {
    await arena.runner.start(added.slot);
  } catch (error: unknown) {
    arena.reportError(`démarrage de l'agent ${added.slot}`, error);
    await arena.runner.retire(added.slot, "error");
    return refuse(502, "Impossible de démarrer la session de l'agent. Regarde les logs du serveur.");
  }
  return { ok: true, slot: added.slot };
}

/** Retire l'agent actif du visiteur. Renvoie false s'il n'en avait pas. */
export async function leaveArena(arena: ArenaServices, visitorId: string): Promise<boolean> {
  const tenant = findActiveTenantByVisitor(arena.store.get(), visitorId);
  if (!tenant) return false;
  await arena.runner.retire(tenant.slot, "left");
  return true;
}
