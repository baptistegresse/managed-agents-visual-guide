import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createStore, type WorldStore } from "@/lib/world/store";
import { addTenant, applyPaint, createWorld, findTenant } from "@/lib/world/world";
import { createChannel, type Channel } from "./channel";
import type { AgentEvent, SessionGateway } from "./gateway";
import { createAgentRunner, type AgentRunner } from "./runner";

const LIMITS = { maxTurns: 3, turnIntervalMs: 1_000, approvalTimeoutMs: 5_000 };

interface SentResult {
  toolUseId: string;
  text: string;
  isError: boolean;
}

interface Harness {
  store: WorldStore;
  runner: AgentRunner;
  channel: Channel<AgentEvent>;
  messages: string[];
  results: SentResult[];
  interrupts: string[];
  failNextMessage: () => void;
}

function createHarness(): Harness {
  const first = addTenant(createWorld(), { visitorId: "v1", name: "Ada", mission: "peins" });
  const second = addTenant(first.world, { visitorId: "v2", name: "Bob", mission: "peins" });
  const store = createStore(second.world);
  const channel = createChannel<AgentEvent>();
  const messages: string[] = [];
  const results: SentResult[] = [];
  const interrupts: string[] = [];
  let shouldFailMessage = false;

  const gateway: SessionGateway = {
    createSession: async () => "sesn_1",
    events: () => channel,
    sendMessage: async (_sessionId, text) => {
      if (shouldFailMessage) {
        shouldFailMessage = false;
        throw new Error("boom");
      }
      messages.push(text);
    },
    sendToolResult: async (_sessionId, toolUseId, text, isError) => {
      results.push({ toolUseId, text, isError });
    },
    interrupt: async (sessionId) => {
      interrupts.push(sessionId);
    },
    getCostCents: async () => 3,
  };

  const runner = createAgentRunner({
    store,
    gateway,
    limits: LIMITS,
    now: () => 0,
    reportError: () => undefined,
  });

  return {
    store,
    runner,
    channel,
    messages,
    results,
    interrupts,
    failNextMessage: () => {
      shouldFailMessage = true;
    },
  };
}

async function emit(harness: Harness, event: AgentEvent): Promise<void> {
  harness.channel.push(event);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("starting an agent", () => {
  test("sends the kickoff as turn 1 and marks the agent as thinking", async () => {
    const harness = createHarness();

    await harness.runner.start(0);

    expect(harness.messages).toHaveLength(1);
    expect(harness.messages[0]).toContain("Ada");
    expect(findTenant(harness.store.get(), 0)).toMatchObject({ status: "thinking", turn: 1 });
  });

  test("retires the agent when the kickoff cannot be sent", async () => {
    const harness = createHarness();
    harness.failNextMessage();

    await harness.runner.start(0);

    expect(findTenant(harness.store.get(), 0)).toMatchObject({
      status: "retired",
      retireReason: "error",
    });
  });
});

describe("tool calls", () => {
  test("executes a paint on free cells and answers the session", async () => {
    const harness = createHarness();
    await harness.runner.start(0);

    await emit(harness, {
      type: "tool_call",
      id: "sevt_paint",
      name: "paint_rect",
      input: { x: 0, y: 0, width: 2, height: 1, color: "red" },
    });

    expect(harness.store.get().canvas.colors.startsWith("RR")).toBe(true);
    expect(harness.results).toEqual([
      { toolUseId: "sevt_paint", text: expect.stringContaining("2"), isError: false },
    ]);
  });

  test("holds a paint over another agent until the moderator allows it", async () => {
    const harness = createHarness();
    harness.store.update((world) => applyPaint(world, 1, [{ x: 0, y: 0, code: "B" }]));
    await harness.runner.start(0);

    await emit(harness, {
      type: "tool_call",
      id: "sevt_over",
      name: "paint_pixels",
      input: { pixels: [{ x: 0, y: 0, color: "red" }] },
    });

    expect(harness.results).toEqual([]);
    expect(findTenant(harness.store.get(), 0)?.status).toBe("awaiting_approval");

    const wasResolved = await harness.runner.decideApproval("sevt_over", "allow");

    expect(wasResolved).toBe(true);
    expect(harness.store.get().canvas.colors[0]).toBe("R");
    expect(harness.results).toEqual([
      { toolUseId: "sevt_over", text: expect.any(String), isError: false },
    ]);
  });

  test("denies a held paint automatically when nobody answers in time", async () => {
    const harness = createHarness();
    harness.store.update((world) => applyPaint(world, 1, [{ x: 0, y: 0, code: "B" }]));
    await harness.runner.start(0);
    await emit(harness, {
      type: "tool_call",
      id: "sevt_over",
      name: "paint_pixels",
      input: { pixels: [{ x: 0, y: 0, color: "red" }] },
    });

    await vi.advanceTimersByTimeAsync(LIMITS.approvalTimeoutMs);

    expect(harness.store.get().canvas.colors[0]).toBe("B");
    expect(harness.results[0]).toMatchObject({ toolUseId: "sevt_over", isError: true });
    expect(await harness.runner.decideApproval("sevt_over", "allow")).toBe(false);
  });
});

describe("turns", () => {
  test("wakes the agent again after the interval once its turn has ended", async () => {
    const harness = createHarness();
    await harness.runner.start(0);

    await emit(harness, { type: "idle", reason: "end_turn" });
    expect(findTenant(harness.store.get(), 0)).toMatchObject({ status: "resting", costCents: 3 });
    expect(harness.messages).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(LIMITS.turnIntervalMs);

    expect(harness.messages).toHaveLength(2);
    expect(findTenant(harness.store.get(), 0)).toMatchObject({ status: "thinking", turn: 2 });
  });

  test("does not wake agents while the world is paused, and resumes them afterwards", async () => {
    const harness = createHarness();
    await harness.runner.start(0);
    harness.runner.setPaused(true);

    await emit(harness, { type: "idle", reason: "end_turn" });
    await vi.advanceTimersByTimeAsync(LIMITS.turnIntervalMs * 3);
    expect(harness.messages).toHaveLength(1);

    harness.runner.setPaused(false);
    await vi.advanceTimersByTimeAsync(LIMITS.turnIntervalMs);

    expect(harness.messages).toHaveLength(2);
  });

  test("retires the agent once it has used all its turns", async () => {
    const harness = createHarness();
    await harness.runner.start(0);

    for (let turn = 1; turn < LIMITS.maxTurns; turn += 1) {
      await emit(harness, { type: "idle", reason: "end_turn" });
      await vi.advanceTimersByTimeAsync(LIMITS.turnIntervalMs);
    }
    await emit(harness, { type: "idle", reason: "end_turn" });

    expect(harness.messages).toHaveLength(LIMITS.maxTurns);
    expect(findTenant(harness.store.get(), 0)).toMatchObject({
      status: "retired",
      retireReason: "turns_exhausted",
    });
  });

  test("keeps waiting when the session is idle only because it needs a tool result", async () => {
    const harness = createHarness();
    await harness.runner.start(0);

    await emit(harness, { type: "idle", reason: "requires_action" });
    await vi.advanceTimersByTimeAsync(LIMITS.turnIntervalMs * 2);

    expect(harness.messages).toHaveLength(1);
    expect(findTenant(harness.store.get(), 0)?.status).toBe("thinking");
  });
});

describe("retiring", () => {
  test("retires the agent when its session budget is reached", async () => {
    const harness = createHarness();
    await harness.runner.start(0);

    await emit(harness, { type: "idle", reason: "budget_reached" });

    expect(findTenant(harness.store.get(), 0)).toMatchObject({
      status: "retired",
      retireReason: "budget_reached",
    });
  });

  test("retires the agent when its session terminates", async () => {
    const harness = createHarness();
    await harness.runner.start(0);

    await emit(harness, { type: "terminated" });

    expect(findTenant(harness.store.get(), 0)?.retireReason).toBe("terminated");
  });

  test("interrupts the session and drops pending approvals when the visitor leaves", async () => {
    const harness = createHarness();
    harness.store.update((world) => applyPaint(world, 1, [{ x: 0, y: 0, code: "B" }]));
    await harness.runner.start(0);
    await emit(harness, {
      type: "tool_call",
      id: "sevt_over",
      name: "paint_pixels",
      input: { pixels: [{ x: 0, y: 0, color: "red" }] },
    });

    await harness.runner.retire(0, "left");
    await vi.advanceTimersByTimeAsync(LIMITS.approvalTimeoutMs + LIMITS.turnIntervalMs);

    expect(harness.interrupts).toEqual(["sesn_1"]);
    expect(harness.store.get().approvals).toEqual([]);
    expect(harness.results).toEqual([]);
    expect(findTenant(harness.store.get(), 0)?.retireReason).toBe("left");
  });
});

describe("observability", () => {
  test("records what the agent says, its token usage and session errors", async () => {
    const harness = createHarness();
    await harness.runner.start(0);

    await emit(harness, { type: "running" });
    await emit(harness, { type: "message", text: "Je commence par le coin." });
    await emit(harness, { type: "model_usage", inputTokens: 100, outputTokens: 20 });
    await emit(harness, { type: "error", message: "surcharge" });

    const world = harness.store.get();
    expect(world.activity.map((entry) => entry.text).join("\n")).toContain("Je commence par le coin.");
    expect(world.activity.map((entry) => entry.text).join("\n")).toContain("surcharge");
    expect(findTenant(world, 0)).toMatchObject({ inputTokens: 100, outputTokens: 20 });
  });
});
