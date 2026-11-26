import { describe, expect, test } from "vitest";
import { TOOL_CATALOG, type KeyId, type ToolId } from "./catalog";
import { applyIncident, applyTool, createDesk, openTickets, type Incident } from "./desk";
import { AGENT_HOME } from "./layout";
import { buildOutcomeTimeline, CALLS_PER_ITERATION, DEFAULT_GOAL, goalDescription, grade, MAX_ITERATIONS, rubricText } from "./outcome";
import { flatten, isGate, type Effect, type Step } from "./timeline";

const TOOLS: readonly ToolId[] = ["reply_ticket", "lookup_order", "close_ticket", "escalate_ticket"];
const ALL_TOOLS: readonly ToolId[] = TOOL_CATALOG.map((tool) => tool.id);
const REFUND: Incident = { kind: "refund", customer: "Léa", subject: "Remboursez-moi.", amount: 59 };
const first = (): number => 0;

function effectsOf(steps: readonly Step[], decision: "allow" | "deny" = "allow"): Effect[] {
  return flatten(steps, decision).flatMap((beat) => beat.effects);
}

function names(effects: readonly Effect[]): string[] {
  return effects.flatMap((effect) => (effect.type === "event" ? [effect.name] : []));
}

describe("outcomes", () => {
  function outcome(enabledTools: readonly ToolId[], desk = createDesk(), keys: readonly KeyId[] = []) {
    return buildOutcomeTimeline(DEFAULT_GOAL, { desk, enabledTools, keys, start: AGENT_HOME, random: first, canDelegate: false });
  }

  function verdicts(timeline: ReturnType<typeof outcome>, decision: "allow" | "deny" = "allow"): string[] {
    return effectsOf(timeline.beats, decision).flatMap((effect) =>
      effect.type === "event" && effect.name === "span.outcome_evaluation_end" ? [effect.detail.split(" ")[0]] : [],
    );
  }

  test("the goal is an empty queue, graded one kind of ticket at a time", () => {
    expect(goalDescription(DEFAULT_GOAL)).toBe("Une file vide : plus aucun ticket ouvert.");
    expect(rubricText(DEFAULT_GOAL)).toBe(
      "- Aucune question sans réponse\n- Aucun colis en attente\n- Aucune demande de remboursement en attente\n- Aucun message indésirable",
    );
    expect(grade(DEFAULT_GOAL, createDesk()).map((criterion) => criterion.isMet)).toEqual([false, false, true, true]);
  });

  test("a narrower goal only grades the kinds it names", () => {
    const goal = { kinds: ["spam"] } as const;

    expect(goalDescription(goal)).toBe("Une file allégée : aucun message indésirable.");
    expect(grade(goal, createDesk())).toEqual([{ text: "Aucun message indésirable", isMet: true }]);
  });

  test("the grader sends the agent back until every criterion is met", () => {
    const timeline = outcome(TOOLS);
    const effects = effectsOf(timeline.beats);

    expect(verdicts(timeline)).toEqual(["needs_revision", "satisfied"]);
    expect(grade(DEFAULT_GOAL, timeline.desk).every((criterion) => criterion.isMet)).toBe(true);
    expect(names(effects)).toContain("user.define_outcome");
    expect(effects.findLast((effect) => effect.type === "status")).toEqual({ type: "status", status: "idle" });
  });

  test("the agent works in short bursts, which is what leaves work to the grader", () => {
    const beats = flatten(outcome(TOOLS).beats);
    const firstGrading = beats.findIndex((beat) =>
      beat.effects.some((effect) => effect.type === "event" && effect.name === "span.outcome_evaluation_start"),
    );

    const callsBefore = names(beats.slice(0, firstGrading).flatMap((beat) => beat.effects)).filter(
      (name) => name === "agent.custom_tool_use",
    );

    expect(callsBefore).toHaveLength(CALLS_PER_ITERATION);
  });

  test("an already empty queue is validated at the first evaluation", () => {
    const empty = openTickets(createDesk()).reduce(
      (desk, ticket) => applyTool(desk, { tool: "reply_ticket", input: { ticket: ticket.id } }, []).desk,
      createDesk(),
    );

    expect(verdicts(outcome(TOOLS, empty))).toEqual(["satisfied"]);
  });

  test("it gives up after the maximum number of iterations when a tool is missing", () => {
    const timeline = outcome(["lookup_order"]);

    expect(verdicts(timeline)).toHaveLength(MAX_ITERATIONS);
    expect(verdicts(timeline).at(-1)).toBe("max_iterations_reached");
  });

  test("a refund on the way to the goal still waits for approval, and a refusal leaves the criterion unmet", () => {
    const desk = openTickets(createDesk()).reduce(
      (current, ticket) => applyTool(current, { tool: "reply_ticket", input: { ticket: ticket.id } }, []).desk,
      applyIncident(createDesk(), REFUND),
    );

    const timeline = outcome(ALL_TOOLS, desk, ["paiements"]);

    expect(timeline.beats.some(isGate)).toBe(true);
    expect(verdicts(timeline, "allow")).toEqual(["satisfied"]);
    expect(verdicts(timeline, "deny").at(-1)).toBe("max_iterations_reached");
    expect(openTickets(timeline.desk)).toEqual([]);
  });
});
