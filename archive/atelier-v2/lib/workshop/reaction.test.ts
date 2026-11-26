import { describe, expect, test } from "vitest";
import { TOOL_CATALOG } from "./catalog";
import { applyIncident, applyTool, createDesk, DESK_SIZE, openTickets, type Desk } from "./desk";
import { AGENT_HOME } from "./layout";
import { reactTo, ROUND_MESSAGE, type ReactionInput, type Trigger } from "./reaction";
import { flatten, isGate, type Effect, type Timeline } from "./timeline";

const first = (): number => 0;

function react(trigger: Trigger, overrides: Partial<ReactionInput> = {}): Timeline | null {
  return reactTo(trigger, {
    desk: createDesk(),
    enabledTools: ["reply_ticket", "lookup_order", "close_ticket", "escalate_ticket"],
    keys: [],
    start: AGENT_HOME,
    random: first,
    ...overrides,
  });
}

function effects(timeline: Timeline | null): Effect[] {
  return flatten(timeline?.beats ?? []).flatMap((beat) => beat.effects);
}

function events(timeline: Timeline | null, name: string): string[] {
  return effects(timeline).flatMap((effect) => (effect.type === "event" && effect.name === name ? [effect.detail] : []));
}

function said(timeline: Timeline | null): string[] {
  return effects(timeline).flatMap((effect) => (effect.type === "bubble" && effect.text ? [effect.text] : []));
}

function emptied(): Desk {
  return openTickets(createDesk()).reduce(
    (desk, ticket) => applyTool(desk, { tool: "reply_ticket", input: { ticket: ticket.id } }, []).desk,
    createDesk(),
  );
}

describe("a ticket that arrives through an entry point", () => {
  test("shows up on the desk before the agent wakes, then the agent handles that ticket and only that one", () => {
    const timeline = react({ entry: "webhook", kind: "question" });

    const opening = flatten(timeline?.beats ?? [])[0].effects;
    const shown = opening.find((effect) => effect.type === "desk");

    expect(opening).toContainEqual({ type: "entry", point: "webhook" });
    expect(shown).toMatchObject({ desk: { tickets: [{}, {}, {}, { id: 4, kind: "question", status: "open" }] } });
    expect(events(timeline, "agent.custom_tool_use")).toEqual(['reply_ticket({"ticket":4})']);
    expect(timeline?.desk.tickets.map((ticket) => ticket.status)).toEqual(["open", "open", "open", "resolved"]);
  });

  test("the message that wakes the agent is what the customer wrote", () => {
    const timeline = react({ entry: "webhook", kind: "delivery" });

    expect(events(timeline, "user.message")[0]).toMatch(/^Nouveau ticket d.+ : « .+ »$/);
  });

  test("a refund request with the payment key waits for approval, then goes through", () => {
    const timeline = react(
      { entry: "webhook", kind: "refund" },
      { enabledTools: TOOL_CATALOG.map((tool) => tool.id), keys: ["paiements"] },
    );

    expect(timeline?.beats.some(isGate)).toBe(true);
    expect(timeline?.desk.tickets.at(-1)).toMatchObject({ kind: "refund", isRefunded: true, status: "resolved" });
  });

  test("an unwanted message is closed and leaves the desk", () => {
    const timeline = react({ entry: "webhook", kind: "spam" });

    expect(timeline?.desk.tickets).toHaveLength(3);
  });

  test("a random ticket is one of the known kinds", () => {
    const timeline = react({ entry: "webhook", kind: "random" });

    expect(effects(timeline).some((effect) => effect.type === "desk" && effect.desk.tickets.length === 4)).toBe(true);
  });

  test("nothing starts when the desk is full of open tickets", () => {
    const full = Array.from({ length: DESK_SIZE * DESK_SIZE }).reduce<Desk>(
      (desk) => applyIncident(desk, { kind: "question", customer: "Nina", subject: "Une question.", amount: null }),
      { tickets: [], nextId: 1 },
    );

    expect(react({ entry: "webhook", kind: "question" }, { desk: full })).toBeNull();
  });
});

describe("a scheduled round", () => {
  test("handles every ticket left unanswered without making a new one arrive", () => {
    const timeline = react({ entry: "cron", kind: "round" });

    expect(events(timeline, "user.message")).toEqual([ROUND_MESSAGE]);
    expect(timeline?.desk.tickets).toHaveLength(3);
    expect(openTickets(timeline?.desk ?? createDesk())).toEqual([]);
  });

  test("with nothing waiting just reports and ends", () => {
    const timeline = react({ entry: "cron", kind: "round" }, { desk: emptied() });

    expect(events(timeline, "agent.custom_tool_use")).toEqual([]);
    expect(said(timeline)).toEqual(["Relance terminée : aucun ticket n'attend de réponse, je retourne dormir."]);
  });

  test("opens a fresh session, so the agent rereads its notebook and keeps the remembered tone", () => {
    const timeline = react({ entry: "cron", kind: "round" }, { memory: ["Ton préféré : tutoiement"] });

    expect(events(timeline, "agent.tool_use")).toEqual(["read : /mnt/memory/notes.md"]);
    expect(events(timeline, "agent.custom_tool_use")).toContain('reply_ticket({"ticket":1,"tone":"tu"})');
  });
});

describe("what the session was given also applies when an entry point wakes the agent", () => {
  test("a webhook in the middle of a session does not reread the notebook", () => {
    const timeline = react({ entry: "webhook", kind: "question" }, { memory: ["Ton préféré : tutoiement"] });

    expect(events(timeline, "agent.tool_use")).toEqual([]);
    expect(events(timeline, "agent.custom_tool_use")).toEqual(['reply_ticket({"ticket":4,"tone":"tu"})']);
  });

  test("the refund skill is loaded before a refund request is handled", () => {
    const timeline = react(
      { entry: "webhook", kind: "refund" },
      { hasSkill: true, sandbox: "always_allow", enabledTools: TOOL_CATALOG.map((tool) => tool.id), keys: ["paiements"] },
    );

    expect(events(timeline, "agent.tool_use")).toEqual(["read : /workspace/skills/remboursement/SKILL.md"]);
  });
});
