import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LIMITS } from "@/lib/config";
import { createAgentRunner } from "@/lib/agents/runner";
import { createSimulatedGateway } from "@/lib/agents/simulatedGateway";
import type { SessionGateway } from "@/lib/agents/gateway";
import { createStore } from "@/lib/world/store";
import { activeTenants, createWorld, findTenant } from "@/lib/world/world";
import { joinArena, leaveArena, type ArenaServices } from "./join";

function createArena(overrides: Partial<SessionGateway> = {}, isReady = true): ArenaServices {
  const store = createStore(createWorld());
  const reportError = (): void => undefined;
  const runner = createAgentRunner({
    store,
    gateway: { ...createSimulatedGateway(), ...overrides },
    limits: LIMITS,
    now: () => 0,
    reportError,
  });
  return { store, runner, isReady, now: () => 0, reportError };
}

const VALID = { name: "Ada", mission: "dessine un soleil" };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("joinArena", () => {
  test("adds the visitor's agent and starts its session", async () => {
    const arena = createArena();

    const result = await joinArena(arena, "visitor-1", VALID);

    expect(result).toEqual({ ok: true, slot: 0 });
    expect(findTenant(arena.store.get(), 0)).toMatchObject({ name: "Ada", status: "thinking" });
  });

  test("lets simulated agents paint the shared canvas over a few turns", async () => {
    const arena = createArena();
    await joinArena(arena, "visitor-1", VALID);

    await vi.advanceTimersByTimeAsync(LIMITS.turnIntervalMs * 2);

    expect(arena.store.get().changes.length).toBeGreaterThan(0);
    expect(findTenant(arena.store.get(), 0)?.turn).toBeGreaterThan(1);
  });

  test("rejects invalid input", async () => {
    const result = await joinArena(createArena(), "visitor-1", { name: "", mission: "x" });

    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  test("allows only one active agent per visitor", async () => {
    const arena = createArena();
    await joinArena(arena, "visitor-1", VALID);

    const second = await joinArena(arena, "visitor-1", VALID);

    expect(second).toMatchObject({ ok: false, status: 409 });
  });

  test("refuses new agents once the arena is full", async () => {
    const arena = createArena();
    for (let index = 0; index < LIMITS.maxActiveAgents; index += 1) {
      await joinArena(arena, `visitor-${index}`, VALID);
    }

    const result = await joinArena(arena, "one-too-many", VALID);

    expect(result).toMatchObject({ ok: false, status: 429 });
    expect(activeTenants(arena.store.get())).toHaveLength(LIMITS.maxActiveAgents);
  });

  test("reports a clear error and retires the agent when the session cannot start", async () => {
    const arena = createArena({
      createSession: async () => {
        throw new Error("401");
      },
    });

    const result = await joinArena(arena, "visitor-1", VALID);

    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(findTenant(arena.store.get(), 0)?.status).toBe("retired");
  });

  test("refuses to start agents when the arena is not configured", async () => {
    const result = await joinArena(createArena({}, false), "visitor-1", VALID);

    expect(result).toMatchObject({ ok: false, status: 503 });
  });
});

describe("leaveArena", () => {
  test("retires the visitor's agent and frees their slot for a new one", async () => {
    const arena = createArena();
    await joinArena(arena, "visitor-1", VALID);

    const didLeave = await leaveArena(arena, "visitor-1");
    const again = await joinArena(arena, "visitor-1", VALID);

    expect(didLeave).toBe(true);
    expect(findTenant(arena.store.get(), 0)?.retireReason).toBe("left");
    expect(again).toEqual({ ok: true, slot: 1 });
  });

  test("returns false when the visitor has no agent", async () => {
    expect(await leaveArena(createArena(), "nobody")).toBe(false);
  });
});
