import type { GridPoint } from "@/lib/iso/projection";
import type { KeyId, ToolId } from "./catalog";
import { applyIncident, describeIncident, openTickets, pickIncident, type Desk, type TicketKind } from "./desk";
import { planReaction, recallSteps, rememberedTone, type ReactionContext } from "./planner";
import { buildTimeline, type EntryPoint, type SandboxPolicy, type Timeline } from "./timeline";

/** Ce qu'un point d'entrée déclenche : un ticket d'un type précis, un ticket au hasard, ou une relance. */
export type TriggerKind = TicketKind | "random" | "round";

export interface Trigger {
  readonly entry: EntryPoint;
  readonly kind: TriggerKind;
}

export interface ReactionInput {
  readonly desk: Desk;
  readonly enabledTools: readonly ToolId[];
  readonly keys: readonly KeyId[];
  readonly start: GridPoint;
  readonly random: () => number;
  readonly sandbox?: SandboxPolicy;
  readonly canDelegate?: boolean;
  readonly hasSkill?: boolean;
  /** Les notes du carnet de mémoire, s'il y en a un : elles donnent le ton des réponses. */
  readonly memory?: readonly string[] | null;
  /** Premier tour de la session : c'est là qu'il relit ses notes. */
  readonly isFirstTurn?: boolean;
}

export const ROUND_MESSAGE = "Relance programmée : traite les tickets restés sans réponse.";

/**
 * Un point d'entrée se déclenche : le ticket arrive dans la boîte de support
 * (sauf pour une relance), puis l'agent se réveille et le traite. `null` si
 * aucun ticket ne peut arriver, la planche étant pleine.
 */
export function reactTo(trigger: Trigger, input: ReactionInput): Timeline | null {
  const { enabledTools, keys, start, sandbox, canDelegate, hasSkill } = input;
  const isRound = trigger.kind === "round";
  // Un déploiement planifié ouvre une session neuve : s'il a un carnet, il le relit à chaque échéance.
  const recall = recallSteps(input.memory, trigger.entry === "cron" || (input.isFirstTurn ?? false));
  const handling: ReactionContext = {
    enabledTools,
    isRound,
    hasSkill,
    hasSandbox: sandbox !== undefined && sandbox !== "off",
    tone: rememberedTone(input.memory),
  };
  const context = { keys, start, entry: trigger.entry, sandbox, canDelegate, memory: input.memory ?? [] };

  if (trigger.kind === "round") {
    const plan = [...recall, ...planReaction(openTickets(input.desk), handling)];
    return buildTimeline(ROUND_MESSAGE, plan, { ...context, desk: input.desk });
  }

  const incident = pickIncident(input.desk, input.random, trigger.kind === "random" ? undefined : trigger.kind);
  if (!incident) return null;
  const desk = applyIncident(input.desk, incident);
  const arrived = desk.tickets.at(-1);
  const plan = [...recall, ...planReaction(arrived ? [arrived] : [], handling)];
  return buildTimeline(describeIncident(incident), plan, { ...context, desk });
}
