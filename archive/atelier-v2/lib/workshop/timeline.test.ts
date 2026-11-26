import { describe, expect, test } from "vitest";
import type { KeyId } from "./catalog";
import { applyIncident, applyTool, createDesk, describeIncident, ticketById, type Incident } from "./desk";
import { AGENT_DESK, AGENT_HOME, BRIDGE_MIDDLE, ORDERS_STAND, tileStand, WORKER_HOME } from "./layout";
import type { PlanStep } from "./planner";
import { buildTimeline, flatten, isGate, type Effect, type Hop, type Timeline } from "./timeline";

type Decision = "allow" | "deny";

const REFUND_INCIDENT: Incident = { kind: "refund", customer: "Léa", subject: "Remboursez-moi.", amount: 59 };
/** La boîte de départ, plus la demande de remboursement de Léa (ticket 4), commande déjà retrouvée. */
const WITH_REFUND = applyTool(applyIncident(createDesk(), REFUND_INCIDENT), { tool: "lookup_order", input: { ticket: 4 } }, []).desk;

function build(plan: readonly PlanStep[], keys: readonly KeyId[] = [], desk = createDesk()): Timeline {
  return buildTimeline("ma tâche", plan, { desk, keys, start: AGENT_HOME });
}

function effects(timeline: Timeline, decision: Decision = "allow"): Effect[] {
  return flatten(timeline.beats, decision).flatMap((beat) => beat.effects);
}

function eventNames(timeline: Timeline, decision: Decision = "allow"): string[] {
  return effects(timeline, decision).flatMap((effect) => (effect.type === "event" ? [effect.name] : []));
}

/** Les trajets d'appels, sous la forme « départ>arrivée ». */
function routes(timeline: Timeline, decision: Decision = "allow"): string[] {
  return effects(timeline, decision)
    .flatMap((effect) => (effect.type === "hop" && effect.hop ? [effect.hop] : []))
    .map((hop: Hop) => `${hop.from}>${hop.to}`);
}

function said(timeline: Timeline, decision: Decision = "allow"): string[] {
  return effects(timeline, decision).flatMap((effect) => (effect.type === "bubble" && effect.text ? [effect.text] : []));
}

function workerStops(timeline: Timeline) {
  return effects(timeline).flatMap((effect) => (effect.type === "move" && effect.who === "worker" ? [effect.to] : []));
}

const REPLY: PlanStep = { type: "call", tool: "reply_ticket", input: { ticket: 2 } };
const LOOKUP: PlanStep = { type: "call", tool: "lookup_order", input: { ticket: 2 } };
const TRACK: PlanStep = { type: "call", tool: "track_parcel", input: { ticket: 2 } };
const REFUND: PlanStep = { type: "call", tool: "create_refund", input: { ticket: 4 } };
const REPLY_AFTER_REFUND: PlanStep = { type: "call", tool: "reply_ticket", input: { ticket: 4 }, dependsOn: "create_refund" };

describe("a custom tool call", () => {
  test("mirrors the real session event order", () => {
    const timeline = build([REPLY]);

    expect(eventNames(timeline)).toEqual([
      "user.message",
      "session.status_running",
      "agent.custom_tool_use",
      "session.status_idle",
      "user.custom_tool_result",
      "session.status_running",
      "session.status_idle",
    ]);
    expect(ticketById(timeline.desk, 2)?.status).toBe("resolved");
  });

  test("names the tool and the ticket number in the event stream", () => {
    const use = effects(build([REPLY])).find((effect) => effect.type === "event" && effect.name === "agent.custom_tool_use");

    expect(use).toMatchObject({ detail: 'reply_ticket({"ticket":2})' });
  });

  test("is executed by your application: its worker carries the tool, the agent never leaves the session", () => {
    const all = effects(build([REPLY]));

    const carried = all.flatMap((effect) => (effect.type === "carry" ? [effect] : []));
    const agentStops = all.flatMap((effect) => (effect.type === "move" && !effect.who ? [effect.to] : []));

    expect(carried).toEqual([
      { type: "carry", who: "worker", tool: "reply_ticket" },
      { type: "carry", who: "worker", tool: null },
    ]);
    expect(agentStops).toEqual([AGENT_DESK, AGENT_HOME]);
  });

  test("travels from the agent to your application, and the result travels back", () => {
    expect(routes(build([REPLY]))).toEqual(["app>agent", "agent>app", "app>agent"]);
  });

  test("a tool that acts on a ticket sends the worker over the bridge to that ticket's slot", () => {
    const stops = workerStops(build([REPLY]));

    expect(stops).toContainEqual(BRIDGE_MIDDLE);
    expect(stops).toContainEqual(tileStand(1, 0));
    expect(stops.at(-1)).toEqual(WORKER_HOME);
  });

  test("a tool that reads your orders database keeps the worker at home, in front of the database", () => {
    const timeline = build([LOOKUP]);

    expect(workerStops(timeline)).toContainEqual(ORDERS_STAND);
    expect(workerStops(timeline)).not.toContainEqual(BRIDGE_MIDDLE);
    expect(routes(timeline)).toEqual(["app>agent", "agent>app", "app>orders", "app>agent"]);
    expect(ticketById(timeline.desk, 2)?.isOrderKnown).toBe(true);
  });

  test("a failed call is reported by the agent", () => {
    const timeline = build([{ type: "call", tool: "lookup_order", input: { ticket: 1 } }]);

    expect(said(timeline)).toContain("Raté : Ce ticket ne concerne aucune commande.");
  });
});

describe("a tool that belongs to a third-party service", () => {
  test("is called by the platform over MCP, without your application", () => {
    const timeline = build([TRACK], ["transporteur"]);

    expect(eventNames(timeline)).toEqual([
      "user.message",
      "session.status_running",
      "agent.mcp_tool_use",
      "agent.mcp_tool_result",
      "session.status_idle",
    ]);
    expect(effects(timeline).some((effect) => effect.type === "carry")).toBe(false);
    expect(timeline.beats.some(isGate)).toBe(false);
    expect(ticketById(timeline.desk, 2)?.isTracked).toBe(true);
  });

  test("picks up its credential at the vault on the way; a tool that only reads changes nothing on the desk", () => {
    const timeline = build([TRACK], ["transporteur"]);

    expect(routes(timeline)).toEqual([
      "app>agent",
      "agent>vault",
      "vault>service:transporteur",
      "service:transporteur>agent",
    ]);
    expect(effects(timeline)).toContainEqual({ type: "key", key: "transporteur", isDenied: false });
  });

  test("fails at the vault when the credential is missing, and leaves the desk alone", () => {
    const timeline = build([REFUND], [], WITH_REFUND);

    const result = effects(timeline).find((effect) => effect.type === "event" && effect.name === "agent.mcp_tool_result");

    expect(result).toMatchObject({ isError: true, detail: "Accès refusé : la « Clé Paiements » n'est pas dans le vault." });
    expect(timeline.desk).toBe(WITH_REFUND);
    expect(timeline.beats.some(isGate)).toBe(false);
    expect(effects(timeline)).toContainEqual({ type: "key", key: "paiements", isDenied: true });
    expect(routes(timeline)).not.toContain("vault>service:paiements");
    expect(said(timeline)).toContain("Impossible : Accès refusé : la « Clé Paiements » n'est pas dans le vault.");
  });

  test("is not retried in the same turn once refused, and what depended on it is skipped", () => {
    const timeline = build([REFUND, REFUND, REPLY_AFTER_REFUND, REPLY], [], WITH_REFUND);

    const names = eventNames(timeline);

    expect(names.filter((name) => name === "agent.mcp_tool_use")).toHaveLength(1);
    expect(names.filter((name) => name === "agent.custom_tool_use")).toHaveLength(1);
    expect(ticketById(timeline.desk, 4)?.status).toBe("open");
    expect(ticketById(timeline.desk, 2)?.status).toBe("resolved");
  });
});

describe("a refund, which waits for your approval", () => {
  const timeline = build([REFUND, REPLY_AFTER_REFUND, { type: "say", text: "C'est réglé." }], ["paiements"], WITH_REFUND);

  test("stops the session at the vault, after the key check, and says what it is about to do", () => {
    const before = timeline.beats.slice(0, timeline.beats.findIndex(isGate)).flatMap((step) => (isGate(step) ? [] : step.effects));
    const gate = timeline.beats.find(isGate);

    expect(before).toContainEqual({ type: "key", key: "paiements", isDenied: false });
    expect(before.some((effect) => effect.type === "hop" && effect.hop?.to === "service:paiements")).toBe(false);
    expect(gate?.ask.effects).toContainEqual({
      type: "approval",
      request: { tool: "MCP paiements", target: "create_refund · 59 € pour Léa" },
    });
  });

  test("once allowed, goes through the service, refunds the customer, then the agent answers", () => {
    expect(eventNames(timeline, "allow")).toEqual([
      "user.message",
      "session.status_running",
      "agent.mcp_tool_use",
      "session.status_idle",
      "user.tool_confirmation",
      "session.status_running",
      "agent.mcp_tool_result",
      "agent.custom_tool_use",
      "session.status_idle",
      "user.custom_tool_result",
      "session.status_running",
      "agent.message",
      "session.status_idle",
    ]);
    expect(routes(timeline, "allow")).toEqual(
      expect.arrayContaining(["agent>vault", "vault>service:paiements", "service:paiements>desk", "service:paiements>agent"]),
    );
    expect(effects(timeline, "allow")).toContainEqual({
      type: "hop",
      hop: { from: "service:paiements", to: "desk", label: "59 € remboursés", tone: "effect" },
    });
    expect(ticketById(timeline.desk, 4)).toMatchObject({ isRefunded: true, status: "resolved" });
  });

  test("once denied, returns an error result and the agent abandons the rest of the turn", () => {
    const denied = effects(timeline, "deny");

    expect(eventNames(timeline, "deny")).toEqual([
      "user.message",
      "session.status_running",
      "agent.mcp_tool_use",
      "session.status_idle",
      "user.tool_confirmation",
      "agent.mcp_tool_result",
      "session.status_running",
      "agent.message",
      "session.status_idle",
    ]);
    expect(denied.find((effect) => effect.type === "event" && effect.name === "agent.mcp_tool_result")).toMatchObject({
      detail: "Permission refusée.",
      isError: true,
    });
    expect(routes(timeline, "deny")).not.toContain("vault>service:paiements");
    expect(denied.some((effect) => effect.type === "desk")).toBe(false);
    expect(said(timeline, "deny")).not.toContain("C'est réglé.");
    expect(denied.findLast((effect) => effect.type === "approval")).toEqual({ type: "approval", request: null });
  });

  test("an order nobody looked up is still asked about, then refused by the service", () => {
    const unknown = build([REFUND], ["paiements"], applyIncident(createDesk(), REFUND_INCIDENT));

    expect(unknown.beats.some(isGate)).toBe(true);
    expect(said(unknown)).toContain("Raté : Commande inconnue : cherche-la d'abord.");
    expect(routes(unknown)).not.toContain("service:paiements>desk");
  });
});

describe("a turn", () => {
  test("reports the desk of the approved path when one of its calls waits for approval", () => {
    const timeline = buildTimeline(
      "ma tâche",
      [{ type: "sandbox", tool: "bash", target: "ls", output: "ok" }, REPLY],
      { desk: createDesk(), keys: [], start: AGENT_HOME, sandbox: "always_ask" },
    );

    expect(ticketById(timeline.desk, 2)?.status).toBe("resolved");
  });

  test("speaks the plan's sentences as agent messages", () => {
    const timeline = build([{ type: "say", text: "Bonjour" }]);

    expect(eventNames(timeline)).toContain("agent.message");
    expect(effects(timeline)).toContainEqual({ type: "bubble", text: "Bonjour" });
  });

  test("a closing sentence is only said when the turn went the way it assumes", () => {
    const outro: PlanStep[] = [
      { type: "say", text: "Tout va bien.", when: "granted" },
      { type: "say", text: "Il manque un accès.", when: "denied" },
    ];

    const smooth = said(build([REPLY, ...outro]));
    const blocked = said(build([TRACK, ...outro]));

    expect(smooth).toContain("Tout va bien.");
    expect(smooth).not.toContain("Il manque un accès.");
    expect(blocked).toContain("Il manque un accès.");
    expect(blocked).not.toContain("Tout va bien.");
  });

  test("ends idle, back in bed, with no call left in the air", () => {
    const all = effects(build([REPLY]));

    expect(all.findLast((effect) => effect.type === "move" && !effect.who)).toMatchObject({ to: AGENT_HOME });
    expect(all.findLast((effect) => effect.type === "status")).toEqual({ type: "status", status: "idle" });
    expect(all.findLast((effect) => effect.type === "hop")).toEqual({ type: "hop", hop: null });
    expect(all.at(-1)).toEqual({ type: "mood", mood: "idle" });
  });
});

describe("buildTimeline from an entry point", () => {
  const incident: Incident = { kind: "question", customer: "Emma", subject: "Quels sont vos délais ?", amount: null };
  const arrived = applyIncident(createDesk(), incident);

  function wake(point: "api" | "webhook" | "cron") {
    return buildTimeline(describeIncident(incident), [{ type: "call", tool: "reply_ticket", input: { ticket: 4 } }], {
      desk: arrived,
      keys: [],
      start: AGENT_HOME,
      entry: point,
    });
  }

  test("rings the entry point and shows the new ticket before the agent wakes up", () => {
    const first = flatten(wake("webhook").beats)[0].effects;

    expect(first).toContainEqual({ type: "entry", point: "webhook" });
    expect(first).toContainEqual({ type: "desk", desk: arrived });
    expect(first.find((effect) => effect.type === "event")).toMatchObject({
      origin: "entry",
      detail: "Nouveau ticket d'Emma : « Quels sont vos délais ? »",
    });
    expect(first.some((effect) => effect.type === "mood")).toBe(false);
  });

  test("a webhook comes from the support desk to your application, which then messages the session", () => {
    expect(routes(wake("webhook")).slice(0, 2)).toEqual(["desk>webhook", "webhook>agent"]);
  });

  test("a scheduled deployment opens a fresh session by itself, without your application", () => {
    const timeline = wake("cron");

    expect(flatten(timeline.beats)[0].effects).toContainEqual({ type: "freshSession" });
    expect(routes(timeline)[0]).toBe("cron>agent");
  });

  test("the first message of a deployment is sent by the platform, not by your application", () => {
    const message = (point: "api" | "cron") =>
      effects(wake(point)).find((effect) => effect.type === "event" && effect.name === "user.message");

    expect(message("cron")).toMatchObject({ origin: "session" });
    expect(message("api")).toMatchObject({ origin: "app" });
  });

  test("an API call does not open a new session", () => {
    expect(effects(wake("api")).some((effect) => effect.type === "freshSession")).toBe(false);
  });

  test("names the entry point in the event stream and stops ringing once the agent is awake", () => {
    const timeline = wake("cron");

    expect(eventNames(timeline)[0]).toContain("cron");
    expect(flatten(timeline.beats)[1].effects).toContainEqual({ type: "entry", point: null });
    expect(ticketById(timeline.desk, 4)?.status).toBe("resolved");
  });
});
