import { LIMITS } from "@/lib/config";
import { evaluateToolCall, resolveApproval, type ApprovalDecision } from "@/lib/tools/execute";
import { buildKickoffMessage, buildTurnMessage } from "@/lib/world/digest";
import type { WorldStore } from "@/lib/world/store";
import type { ActivitySource, RetireReason, World } from "@/lib/world/types";
import {
  findTenant,
  isActive,
  logActivity,
  patchTenant,
  removeApprovalsOf,
  setPaused,
} from "@/lib/world/world";
import type { AgentEvent, SessionGateway } from "./gateway";

export interface RunnerLimits {
  readonly maxTurns: number;
  readonly turnIntervalMs: number;
  readonly approvalTimeoutMs: number;
}

export interface RunnerDeps {
  readonly store: WorldStore;
  readonly gateway: SessionGateway;
  readonly limits: RunnerLimits;
  readonly now: () => number;
  readonly reportError: (context: string, error: unknown) => void;
}

export interface AgentRunner {
  start(slot: number): Promise<void>;
  retire(slot: number, reason: RetireReason): Promise<void>;
  decideApproval(approvalId: string, decision: ApprovalDecision): Promise<boolean>;
  setPaused(isPaused: boolean): void;
}

interface LiveSession {
  readonly sessionId: string;
  readonly abort: AbortController;
}

type Timer = ReturnType<typeof setTimeout>;

const RETIRE_LABEL: Readonly<Record<RetireReason, string>> = {
  turns_exhausted: "a utilisé tous ses tours",
  budget_reached: "a atteint son budget",
  left: "a été retiré par son visiteur",
  terminated: "a vu sa session se terminer",
  error: "s'arrête après une erreur",
};

/** Sessions qu'il faut interrompre côté Anthropic parce qu'elles peuvent encore travailler. */
const REASONS_TO_INTERRUPT: ReadonlySet<RetireReason> = new Set(["left", "error"]);

/** Fait vivre chaque agent : une session Managed Agents, réveillée tour après tour. */
export function createAgentRunner(deps: RunnerDeps): AgentRunner {
  const { store, gateway, limits, now, reportError } = deps;
  const sessions = new Map<number, LiveSession>();
  const turnTimers = new Map<number, Timer>();
  const approvalTimers = new Map<string, Timer>();

  const log = (slot: number, source: ActivitySource, text: string): void => {
    store.update((world) => logActivity(world, { slot, source, text }, now()));
  };

  const nameOf = (world: World, slot: number): string => findTenant(world, slot)?.name ?? "?";

  const clearTimer = <K>(timers: Map<K, Timer>, key: K): void => {
    const timer = timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(key);
  };

  async function retire(slot: number, reason: RetireReason): Promise<void> {
    const tenant = findTenant(store.get(), slot);
    if (!tenant || !isActive(tenant)) return;

    const session = sessions.get(slot);
    sessions.delete(slot);
    clearTimer(turnTimers, slot);
    for (const approval of store.get().approvals) {
      if (approval.slot === slot) clearTimer(approvalTimers, approval.id);
    }

    store.update((world) =>
      logActivity(
        patchTenant(removeApprovalsOf(world, slot), slot, { status: "retired", retireReason: reason }),
        { slot, source: "session", text: `${tenant.name} ${RETIRE_LABEL[reason]}` },
        now(),
      ),
    );

    if (!session) return;
    session.abort.abort();
    if (!REASONS_TO_INTERRUPT.has(reason)) return;
    try {
      await gateway.interrupt(session.sessionId);
    } catch (error: unknown) {
      reportError(`interruption de la session de l'agent ${slot}`, error);
    }
  }

  async function sendTurn(slot: number): Promise<void> {
    const session = sessions.get(slot);
    const tenant = findTenant(store.get(), slot);
    if (!session || !tenant || !isActive(tenant)) return;

    const world = store.get();
    const turn =
      tenant.turn === 0
        ? {
            text: buildKickoffMessage(world, tenant, limits.maxTurns),
            lastChatSeq: tenant.lastChatSeq,
            lastChangeSeq: tenant.lastChangeSeq,
          }
        : buildTurnMessage(world, tenant, limits.maxTurns);

    store.update((current) =>
      logActivity(
        patchTenant(current, slot, {
          status: "thinking",
          turn: tenant.turn + 1,
          lastChatSeq: turn.lastChatSeq,
          lastChangeSeq: turn.lastChangeSeq,
        }),
        {
          slot,
          source: "server",
          text: `Tour ${tenant.turn + 1}/${limits.maxTurns} envoyé à ${tenant.name} (user.message)`,
        },
        now(),
      ),
    );

    try {
      await gateway.sendMessage(session.sessionId, turn.text);
    } catch (error: unknown) {
      reportError(`envoi du tour à l'agent ${slot}`, error);
      await retire(slot, "error");
    }
  }

  function scheduleTurn(slot: number): void {
    clearTimer(turnTimers, slot);
    turnTimers.set(
      slot,
      setTimeout(() => {
        turnTimers.delete(slot);
        if (store.get().isPaused) return;
        void sendTurn(slot);
      }, limits.turnIntervalMs),
    );
  }

  async function refreshCost(slot: number, sessionId: string): Promise<void> {
    try {
      const costCents = await gateway.getCostCents(sessionId);
      if (costCents !== null) store.update((world) => patchTenant(world, slot, { costCents }));
    } catch (error: unknown) {
      reportError(`lecture du coût de l'agent ${slot}`, error);
    }
  }

  async function sendToolResult(slot: number, toolUseId: string, text: string, isError: boolean): Promise<void> {
    const session = sessions.get(slot);
    if (!session) return;
    try {
      await gateway.sendToolResult(session.sessionId, toolUseId, text, isError);
    } catch (error: unknown) {
      reportError(`envoi du résultat d'outil à l'agent ${slot}`, error);
      await retire(slot, "error");
    }
  }

  async function decideApproval(approvalId: string, decision: ApprovalDecision): Promise<boolean> {
    const resolved = store.transact((world) => {
      const result = resolveApproval(world, approvalId, decision, now());
      return { world: result?.world ?? world, result };
    });
    if (!resolved) return false;
    clearTimer(approvalTimers, approvalId);
    await sendToolResult(resolved.slot, approvalId, resolved.text, resolved.isError);
    return true;
  }

  async function handleToolCall(
    slot: number,
    event: Extract<AgentEvent, { type: "tool_call" }>,
  ): Promise<void> {
    const outcome = store.transact((world) => {
      const result = evaluateToolCall(
        world,
        { slot, toolUseId: event.id, name: event.name, input: event.input },
        now(),
      );
      return { world: result.world, result };
    });

    if (outcome.kind === "needs_approval") {
      approvalTimers.set(
        outcome.approvalId,
        setTimeout(() => void decideApproval(outcome.approvalId, "timeout"), limits.approvalTimeoutMs),
      );
      return;
    }
    await sendToolResult(slot, event.id, outcome.text, outcome.isError);
  }

  async function handleTurnEnd(slot: number, sessionId: string): Promise<void> {
    const tenant = findTenant(store.get(), slot);
    if (!tenant || !isActive(tenant)) return;
    await refreshCost(slot, sessionId);
    if (tenant.turn >= limits.maxTurns) {
      await retire(slot, "turns_exhausted");
      return;
    }
    store.update((world) => patchTenant(world, slot, { status: "resting" }));
    scheduleTurn(slot);
  }

  async function handleEvent(slot: number, sessionId: string, event: AgentEvent): Promise<void> {
    switch (event.type) {
      case "running":
        store.update((world) => patchTenant(world, slot, { status: "thinking" }));
        return;
      case "tool_call":
        await handleToolCall(slot, event);
        return;
      case "message":
        log(
          slot,
          "model",
          `${nameOf(store.get(), slot)} : ${event.text.slice(0, LIMITS.agentMessagePreviewLength)}`,
        );
        return;
      case "model_usage": {
        const tenant = findTenant(store.get(), slot);
        if (!tenant) return;
        store.update((world) =>
          patchTenant(world, slot, {
            inputTokens: tenant.inputTokens + event.inputTokens,
            outputTokens: tenant.outputTokens + event.outputTokens,
          }),
        );
        return;
      }
      case "idle":
        if (event.reason === "end_turn") await handleTurnEnd(slot, sessionId);
        else if (event.reason === "budget_reached") await retire(slot, "budget_reached");
        else if (event.reason === "other") await retire(slot, "error");
        return;
      case "terminated":
        await retire(slot, "terminated");
        return;
      case "error":
        log(slot, "session", `Erreur de session pour ${nameOf(store.get(), slot)} : ${event.message}`);
        return;
    }
  }

  async function consume(slot: number, session: LiveSession): Promise<void> {
    try {
      for await (const event of gateway.events(session.sessionId, session.abort.signal)) {
        if (session.abort.signal.aborted) return;
        await handleEvent(slot, session.sessionId, event);
      }
    } catch (error: unknown) {
      if (session.abort.signal.aborted) return;
      reportError(`flux d'événements de l'agent ${slot}`, error);
      await retire(slot, "error");
    }
  }

  return {
    async start(slot: number): Promise<void> {
      const tenant = findTenant(store.get(), slot);
      if (!tenant) throw new Error(`Agent ${slot} introuvable`);
      const sessionId = await gateway.createSession(`Arène — ${tenant.name}`);
      const session: LiveSession = { sessionId, abort: new AbortController() };
      sessions.set(slot, session);
      log(slot, "session", `Session créée pour ${tenant.name} : un conteneur et un historique rien qu'à lui`);
      void consume(slot, session);
      await sendTurn(slot);
    },
    retire,
    decideApproval,
    setPaused(isPaused: boolean): void {
      store.update((world) =>
        logActivity(
          setPaused(world, isPaused),
          { slot: null, source: "moderator", text: isPaused ? "Arène en pause" : "Arène relancée" },
          now(),
        ),
      );
      if (isPaused) return;
      for (const tenant of store.get().tenants) {
        if (tenant.status === "resting" && !turnTimers.has(tenant.slot)) scheduleTurn(tenant.slot);
      }
    },
  };
}
