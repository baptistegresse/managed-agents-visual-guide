import { describe, expect, test } from "vitest";
import {
  agentConfig,
  createWorkshop,
  currentStep,
  workshopReducer,
  type WorkshopAction,
  type WorkshopState,
} from "./state";

function play(actions: readonly WorkshopAction[], from: WorkshopState = createWorkshop()): WorkshopState {
  return actions.reduce(workshopReducer, from);
}

const THROUGH_AGENT: readonly WorkshopAction[] = [
  { type: "environmentCreated", id: "env_1" },
  { type: "vaultCreated", id: "vlt_1" },
  { type: "toolsConfirmed" },
  { type: "agentCreated", id: "agent_1" },
];

describe("step order", () => {
  test("walks through environment, vault, tools, agent, then session", () => {
    const steps = THROUGH_AGENT.reduce<string[]>(
      (seen, _action, index) => [...seen, currentStep(play(THROUGH_AGENT.slice(0, index + 1)))],
      [currentStep(createWorkshop())],
    );

    expect(steps).toEqual(["environment", "vault", "tools", "agent", "session"]);
  });

  test("ignores a step completed out of order", () => {
    const state = play([{ type: "agentCreated", id: "agent_1" }]);

    expect(state.agent.id).toBeNull();
    expect(currentStep(state)).toBe("environment");
  });
});

describe("environment", () => {
  test("can be edited until it is created, then is frozen", () => {
    const state = play([
      { type: "environmentEdited", name: "serre", networking: "unrestricted" },
      { type: "environmentCreated", id: "env_1" },
      { type: "environmentEdited", name: "autre", networking: "limited" },
    ]);

    expect(state.environment).toEqual({ name: "serre", networking: "unrestricted", id: "env_1" });
  });
});

describe("vault keys", () => {
  test("toggles keys on and off before the vault is created", () => {
    const state = play([
      { type: "environmentCreated", id: "env_1" },
      { type: "keyToggled", key: "paiements" },
      { type: "keyToggled", key: "transporteur" },
      { type: "keyToggled", key: "paiements" },
    ]);

    expect(state.vault.keys).toEqual(["transporteur"]);
  });

  test("can still receive a key once it exists, but not before its step", () => {
    const later = play([
      { type: "environmentCreated", id: "env_1" },
      { type: "vaultCreated", id: "vlt_1" },
      { type: "keyToggled", key: "paiements" },
    ]);

    expect(later.vault.keys).toEqual(["paiements"]);
    expect(play([{ type: "keyToggled", key: "paiements" }]).vault.keys).toEqual([]);
  });
});

describe("tools", () => {
  test("starts with the custom tools only, a selection that can be toggled", () => {
    const before = play(THROUGH_AGENT.slice(0, 2));

    const after = play([{ type: "toolToggled", tool: "escalate_ticket" }, { type: "toolToggled", tool: "create_refund" }], before);

    expect(before.tools.enabled).toEqual(["reply_ticket", "lookup_order", "close_ticket", "escalate_ticket"]);
    expect(after.tools.enabled).toEqual(["reply_ticket", "lookup_order", "close_ticket", "create_refund"]);
  });

  test("cannot be confirmed with no tool selected", () => {
    const empty = play(
      createWorkshop().tools.enabled.map((tool) => ({ type: "toolToggled", tool }) as const),
      play(THROUGH_AGENT.slice(0, 2)),
    );

    expect(play([{ type: "toolsConfirmed" }], empty).tools.isConfirmed).toBe(false);
  });
});

describe("agent and session", () => {
  test("keeps the agent's name and instructions, and records the session", () => {
    const state = play([
      ...THROUGH_AGENT.slice(0, 3),
      { type: "agentEdited", name: "Rosa", system: "Tu réponds en deux phrases." },
      { type: "agentCreated", id: "agent_1" },
      { type: "sessionStarted", id: "sesn_1" },
    ]);

    expect(state.agent).toMatchObject({ name: "Rosa", system: "Tu réponds en deux phrases.", id: "agent_1", version: 1 });
    expect(state.session.id).toBe("sesn_1");
  });

  test("the default agent is a support assistant that sticks to the tools it was given", () => {
    const { agent } = createWorkshop();

    expect(agent.name).toBe("Assistant support");
    expect(agent.system).toBe(
      "Tu réponds aux clients du support. Tu es précis et courtois, et tu n'utilises que les outils qu'on t'a donnés.",
    );
  });

  test("reset returns to a fresh workshop", () => {
    expect(play([...THROUGH_AGENT, { type: "reset" }])).toEqual(createWorkshop());
  });
});

describe("options", () => {
  test("the sandbox policy is chosen with the tools, delegation with the agent", () => {
    const state = play([
      ...THROUGH_AGENT.slice(0, 2),
      { type: "sandboxChosen", policy: "always_ask" },
      { type: "toolsConfirmed" },
      { type: "delegationToggled" },
      { type: "sandboxChosen", policy: "off" },
    ]);

    expect(state.tools.sandbox).toBe("always_ask");
    expect(state.agent.canDelegate).toBe(true);
  });

  test("budget and memory are set before the session starts, then frozen", () => {
    const state = play([
      ...THROUGH_AGENT.slice(0, 2),
      { type: "sandboxChosen", policy: "always_allow" },
      ...THROUGH_AGENT.slice(2),
      { type: "budgetChosen", cents: 10 },
      { type: "memoryToggled" },
      { type: "sessionStarted", id: "sesn_1" },
      { type: "budgetChosen", cents: 99 },
      { type: "memoryToggled" },
    ]);

    expect(state.session).toMatchObject({ id: "sesn_1", budgetCents: 10, hasMemory: true });
  });

  test("memory needs the sandbox's file tools", () => {
    const state = play([
      ...THROUGH_AGENT.slice(0, 2),
      { type: "sandboxChosen", policy: "off" },
      ...THROUGH_AGENT.slice(2),
      { type: "memoryToggled" },
    ]);

    expect(state.session.hasMemory).toBe(false);
  });

  test("a new session replaces the session id and keeps its settings", () => {
    const state = play([
      ...THROUGH_AGENT,
      { type: "budgetChosen", cents: 10 },
      { type: "sessionStarted", id: "sesn_1" },
      { type: "sessionRestarted", id: "sesn_2" },
    ]);

    expect(state.session).toMatchObject({ id: "sesn_2", budgetCents: 10, hasMemory: false });
  });
});

describe("agent versions", () => {
  const running = play([...THROUGH_AGENT, { type: "sessionStarted", id: "sesn_1" }]);

  test("a session pins the agent version it started on", () => {
    expect(running.session).toMatchObject({ agentVersion: 1, config: agentConfig(running) });
  });

  test("revising the agent creates a new version without touching the running session", () => {
    const revised = play(
      [{ type: "agentRevised", config: { ...agentConfig(running), enabledTools: ["reply_ticket", "create_refund"] } }],
      running,
    );

    expect(revised.agent.version).toBe(2);
    expect(revised.tools.enabled).toEqual(["reply_ticket", "create_refund"]);
    expect(revised.session.agentVersion).toBe(1);
    expect(revised.session.config?.enabledTools).toEqual(running.tools.enabled);
  });

  test("the next session picks up the latest version", () => {
    const next = play(
      [
        { type: "agentRevised", config: { ...agentConfig(running), canDelegate: true } },
        { type: "sessionRestarted", id: "sesn_2" },
      ],
      running,
    );

    expect(next.session).toMatchObject({ id: "sesn_2", agentVersion: 2 });
    expect(next.session.config?.canDelegate).toBe(true);
  });

  test("an unchanged or empty revision is ignored", () => {
    expect(play([{ type: "agentRevised", config: agentConfig(running) }], running).agent.version).toBe(1);
    expect(
      play([{ type: "agentRevised", config: { ...agentConfig(running), enabledTools: [] } }], running).agent.version,
    ).toBe(1);
  });

  test("the skill and the mounted FAQ are opt-in at their own step", () => {
    const state = play([
      ...THROUGH_AGENT.slice(0, 2),
      { type: "sandboxChosen", policy: "always_allow" },
      { type: "toolsConfirmed" },
      { type: "skillToggled" },
      { type: "agentCreated", id: "agent_1" },
      { type: "planToggled" },
      { type: "skillToggled" },
    ]);

    expect(state.agent.hasSkill).toBe(true);
    expect(state.session.hasPlan).toBe(true);
  });

  test("the skill and the mounted FAQ need the sandbox's file tools", () => {
    const state = play([...THROUGH_AGENT.slice(0, 3), { type: "skillToggled" }, { type: "agentCreated", id: "agent_1" }, { type: "planToggled" }]);

    expect(state.agent.hasSkill).toBe(false);
    expect(state.session.hasPlan).toBe(false);
  });
});

describe("web tools", () => {
  test("are opt-in with the tools and need the built-in toolset", () => {
    const withToolset = play([
      ...THROUGH_AGENT.slice(0, 2),
      { type: "sandboxChosen", policy: "always_allow" },
      { type: "webToggled" },
    ]);
    const without = play([...THROUGH_AGENT.slice(0, 2), { type: "sandboxChosen", policy: "off" }, { type: "webToggled" }]);

    expect(withToolset.tools.hasWeb).toBe(true);
    expect(agentConfig(withToolset).hasWeb).toBe(true);
    expect(without.tools.hasWeb).toBe(false);
  });
});

describe("ending a session", () => {
  const running = play([...THROUGH_AGENT, { type: "sessionStarted", id: "sesn_1" }]);

  test("closes it and lets its settings be changed before the next one", () => {
    const ended = play([{ type: "sessionEnded" }, { type: "budgetChosen", cents: 25 }], running);

    expect(ended.session).toMatchObject({ id: null, budgetCents: 25, count: 1 });
    expect(currentStep(ended)).toBe("session");
  });

  test("the next session counts as one more and pins the latest agent version", () => {
    const next = play([{ type: "sessionEnded" }, { type: "sessionStarted", id: "sesn_2" }], running);

    expect(next.session).toMatchObject({ id: "sesn_2", count: 2, agentVersion: 1 });
  });
});
