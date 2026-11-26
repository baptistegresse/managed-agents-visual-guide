import { describe, expect, test } from "vitest";
import { applyTool, createDesk } from "./desk";
import { AGENT_HOME } from "./layout";
import { usedTokens } from "./context";
import { applyCommand, applyEffect, createRun, MAX_EVENT_LINES, type RunState } from "./run";
import type { Effect } from "./effects";

function play(effects: readonly Effect[], from: RunState = createRun()): RunState {
  return effects.reduce(applyEffect, from);
}

describe("createRun", () => {
  test("starts idle, at home, with the customers who were already waiting", () => {
    expect(createRun()).toMatchObject({
      status: "idle",
      actor: { position: AGENT_HOME, mood: "idle", carrying: null, bubble: null },
      desk: createDesk(),
      events: [],
    });
  });
});

describe("applyEffect", () => {
  test("moves the agent and remembers how long the walk takes", () => {
    const state = play([{ type: "move", to: { x: 5, y: 5 }, durationMs: 800 }]);

    expect(state.actor).toMatchObject({ position: { x: 5, y: 5 }, moveMs: 800 });
  });

  test("updates mood, carried tool, bubble and status without touching the rest", () => {
    const state = play([
      { type: "mood", mood: "working" },
      { type: "carry", tool: "reply_ticket" },
      { type: "bubble", text: "Bonjour" },
      { type: "status", status: "running" },
    ]);

    expect(state.actor).toMatchObject({ mood: "working", carrying: "reply_ticket", bubble: "Bonjour" });
    expect(state.status).toBe("running");
    expect(state.actor.position).toEqual(AGENT_HOME);
  });

  test("shows a key in use, then clears it", () => {
    const shown = play([{ type: "key", key: "paiements", isDenied: true }]);
    const cleared = play([{ type: "key", key: null, isDenied: false }], shown);

    expect(shown.activeKey).toEqual({ key: "paiements", isDenied: true });
    expect(cleared.activeKey).toBeNull();
  });

  test("rings an entry point, remembers the last one used, then stops ringing", () => {
    const ringing = play([{ type: "entry", point: "webhook" }]);
    const quiet = play([{ type: "entry", point: null }], ringing);

    expect(ringing).toMatchObject({ activeEntry: "webhook", lastEntry: "webhook" });
    expect(quiet).toMatchObject({ activeEntry: null, lastEntry: "webhook" });
  });

  test("replaces the desk", () => {
    const desk = applyTool(createDesk(), { tool: "reply_ticket", input: { ticket: 1 } }, []).desk;

    expect(play([{ type: "desk", desk }]).desk).toBe(desk);
  });

  test("numbers event lines and keeps only the most recent ones", () => {
    const many: Effect[] = Array.from({ length: MAX_EVENT_LINES + 3 }, (_, index) => ({
      type: "event",
      name: "agent.message",
      detail: `ligne ${index}`,
      origin: "agent",
    }));

    const state = play(many);

    expect(state.events).toHaveLength(MAX_EVENT_LINES);
    expect(state.events.at(-1)).toMatchObject({ seq: MAX_EVENT_LINES + 3, detail: `ligne ${MAX_EVENT_LINES + 2}`, isError: false });
  });
});

describe("the application's worker", () => {
  test("moves and carries a tool on its own, while the agent stays where it is", () => {
    const state = play([
      { type: "move", who: "worker", to: { x: 8, y: 8 }, durationMs: 500 },
      { type: "carry", who: "worker", tool: "lookup_order" },
    ]);

    expect(state.worker).toMatchObject({ position: { x: 8, y: 8 }, moveMs: 500, carrying: "lookup_order" });
    expect(state.actor).toMatchObject({ position: AGENT_HOME, carrying: null });
  });
});

describe("a call travelling between zones", () => {
  test("is shown while it travels, then cleared", () => {
    const hop = { from: "agent", to: "app", label: "reply_ticket", tone: "call" } as const;

    const travelling = play([{ type: "hop", hop }]);

    expect(travelling.hop).toEqual(hop);
    expect(play([{ type: "hop", hop: null }], travelling).hop).toBeNull();
  });
});

describe("the context window", () => {
  const SETUP = { system: "Tu réponds aux clients.", toolLines: ["reply_ticket : envoie une réponse au client"] };
  const session = (): RunState => applyCommand(createRun(), { type: "newSession", budgetCents: null, context: SETUP });
  const message = (text: string): Effect => ({ type: "event", name: "user.message", detail: text, origin: "app" });

  test("a new session opens with the agent's configuration only", () => {
    expect(session().context.blocks.map((block) => block.kind)).toEqual(["system", "tools"]);
  });

  test("grows with what the model reads, not with status events", () => {
    const state = play(
      [message("Réponds au ticket d'Alice"), { type: "event", name: "session.status_running", detail: "", origin: "session" }],
      session(),
    );

    expect(state.context.blocks.map((block) => block.kind)).toEqual(["system", "tools", "user"]);
  });

  test("is compacted by the platform when nearly full, which shows in the event stream", () => {
    const state = play(
      Array.from({ length: 40 }, (_, index) => message(`Un long message numéro ${index} `.repeat(4))),
      session(),
    );

    expect(state.context.compactionCount).toBeGreaterThan(0);
    expect(state.events.some((line) => line.name === "agent.thread_context_compacted")).toBe(true);
    expect(usedTokens(state.context)).toBeLessThan(state.context.limit);
  });

  test("a model request re-sends the whole window", () => {
    const asked = play([message("Réponds au ticket d'Alice")], session());

    const state = applyCommand(asked, { type: "modelRequest" });

    expect(state.context).toMatchObject({ requestCount: 1, lastRequestTokens: usedTokens(asked.context) });
  });

  test("a session opened by a scheduled deployment starts from a blank window", () => {
    const used = play([message("Réponds au ticket d'Alice")], session());

    const fresh = play([{ type: "freshSession" }], used);

    expect(fresh.context.blocks.map((block) => block.kind)).toEqual(["system", "tools"]);
    expect(fresh.desk).toBe(used.desk);
  });
});
