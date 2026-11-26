import { describe, expect, test } from "vitest";
import { TOOL_CATALOG, type ToolId } from "./catalog";
import { applyIncident, applyTool, createDesk, openTickets, type Desk, type Incident } from "./desk";
import { planReaction, planTurn, type PlanContext, type PlanStep } from "./planner";

const CUSTOM_TOOLS: readonly ToolId[] = ["reply_ticket", "lookup_order", "close_ticket", "escalate_ticket"];
const ALL_TOOLS: readonly ToolId[] = TOOL_CATALOG.map((tool) => tool.id);
const REFUND: Incident = { kind: "refund", customer: "Léa", subject: "Remboursez-moi.", amount: 59 };
const SPAM: Incident = { kind: "spam", customer: "Promo Flash", subject: "Gagnez vite !", amount: null };

function plan(task: string, overrides: Partial<PlanContext> = {}): PlanStep[] {
  return planTurn(task, { enabledTools: CUSTOM_TOOLS, desk: createDesk(), random: () => 0, ...overrides });
}

/** Les appels du plan, sous la forme « outil#ticket ». */
function calls(steps: readonly PlanStep[]): string[] {
  return steps.flatMap((step) => (step.type === "call" ? [`${step.tool}#${step.input.ticket}`] : []));
}

function words(steps: readonly PlanStep[]): string {
  return steps.flatMap((step) => (step.type === "say" ? [step.text] : [])).join(" ");
}

function withTickets(...incidents: Incident[]): Desk {
  return incidents.reduce(applyIncident, createDesk());
}

describe("handling one named ticket", () => {
  test("a question is simply answered, with a sentence before and after", () => {
    const steps = plan("Réponds au ticket d'Alice");

    expect(calls(steps)).toEqual(["reply_ticket#1"]);
    expect(steps[0]).toEqual({ type: "say", text: "Je regarde le ticket d'Alice." });
    expect(words(steps)).toContain("C'est réglé.");
  });

  test("an undelivered order is looked up before the customer is answered", () => {
    expect(calls(plan("Réponds au ticket de Bruno"))).toEqual(["lookup_order#2", "reply_ticket#2"]);
  });

  test("an order already looked up is not looked up again", () => {
    const known = applyTool(createDesk(), { tool: "lookup_order", input: { ticket: 2 } }, []).desk;

    expect(calls(plan("Réponds au ticket de Bruno", { desk: known }))).toEqual(["reply_ticket#2"]);
  });

  test("the parcel is tracked too when the carrier's tool is enabled", () => {
    const steps = plan("Occupe-toi du ticket de Bruno", { enabledTools: ALL_TOOLS });

    expect(calls(steps)).toEqual(["lookup_order#2", "track_parcel#2", "reply_ticket#2"]);
  });

  test.each(["réponds au ticket de chloe", "RÉPONDS À CHLOÉ", "Peux-tu répondre au ticket 3 ?", "Traite le ticket n°3"])(
    "%s finds the ticket whatever the case, the accents or the way it is named",
    (task) => {
      expect(calls(plan(task))).toEqual(["reply_ticket#3"]);
    },
  );

  test("a ticket that is already resolved is left alone, and the agent says so", () => {
    const answered = applyTool(createDesk(), { tool: "reply_ticket", input: { ticket: 1 } }, []).desk;

    const steps = plan("Réponds au ticket d'Alice", { desk: answered });

    expect(calls(steps)).toEqual([]);
    expect(words(steps)).toBe("Le ticket d'Alice est déjà résolu.");
  });

  test("a customer with no ticket is reported instead of acted upon", () => {
    const steps = plan("Réponds au ticket de Zoé");

    expect(calls(steps)).toEqual([]);
    expect(words(steps)).toBe("Je ne trouve aucun ticket au nom de Zoé.");
  });
});

describe("a refund request", () => {
  const desk = withTickets(REFUND);

  test("is looked up, refunded, then answered, and the answer depends on the refund", () => {
    const steps = plan("Réponds au ticket de Léa", { desk, enabledTools: ALL_TOOLS });

    expect(calls(steps)).toEqual(["lookup_order#4", "create_refund#4", "reply_ticket#4"]);
    expect(steps.find((step) => step.type === "call" && step.tool === "reply_ticket")).toMatchObject({
      dependsOn: "create_refund",
    });
  });

  test("without the refund tool the agent says so and hands the ticket to the team", () => {
    const steps = plan("Réponds au ticket de Léa", { desk });

    expect(calls(steps)).toEqual(["lookup_order#4", "escalate_ticket#4"]);
    expect(words(steps)).toContain("Je n'ai pas d'outil pour rembourser Léa");
  });

  test("with neither the refund tool nor the escalation tool the ticket stays open", () => {
    const steps = plan("Réponds au ticket de Léa", { desk, enabledTools: ["reply_ticket", "lookup_order"] });

    expect(calls(steps)).toEqual(["lookup_order#4"]);
    expect(words(steps)).toContain("je laisse son ticket ouvert");
  });

  test("« Traite les remboursements » handles the refund tickets and nothing else", () => {
    const steps = plan("Traite les remboursements", { desk, enabledTools: ALL_TOOLS });

    expect(calls(steps)).toEqual(["lookup_order#4", "create_refund#4", "reply_ticket#4"]);
  });
});

describe("handling every waiting ticket", () => {
  test("« Traite les tickets en attente » looks things up first, then answers everyone in arrival order", () => {
    const steps = plan("Traite les tickets en attente");

    expect(calls(steps)).toEqual(["lookup_order#2", "reply_ticket#1", "reply_ticket#2", "reply_ticket#3"]);
    expect(steps[0]).toEqual({ type: "say", text: "3 tickets en attente : je m'en occupe." });
  });

  test("an unwanted message is closed, not answered", () => {
    const steps = plan("Traite les tickets en attente", { desk: withTickets(SPAM) });

    expect(calls(steps)).toContain("close_ticket#4");
    expect(calls(steps)).not.toContain("reply_ticket#4");
  });

  test.each([
    ["Réponds aux questions", ["reply_ticket#1", "reply_ticket#3"]],
    ["Occupe-toi des colis", ["lookup_order#2", "reply_ticket#2"]],
    ["Ferme les messages indésirables", ["close_ticket#4"]],
  ])("%s only handles the tickets of that kind", (task, expected) => {
    expect(calls(plan(task, { desk: withTickets(SPAM) }))).toEqual(expected);
  });

  test("a ticket whose tool is missing is left alone, and the missing tool is named once", () => {
    const steps = plan("Traite les tickets en attente", { enabledTools: ["lookup_order"] });

    expect(calls(steps)).toEqual([]);
    expect(words(steps).match(/« Réponse »/g)).toHaveLength(1);
    expect(words(steps)).not.toContain("C'est réglé.");
  });

  test("only the tickets it can handle are handled when one tool is missing", () => {
    const steps = plan("Traite les tickets en attente", { enabledTools: ["reply_ticket"] });

    expect(calls(steps)).toEqual(["reply_ticket#1", "reply_ticket#3"]);
    expect(words(steps)).toContain("« Commande »");
  });

  test("says so when nothing is waiting", () => {
    const empty = openTickets(createDesk()).reduce(
      (desk, ticket) => applyTool(desk, { tool: "reply_ticket", input: { ticket: ticket.id } }, []).desk,
      createDesk(),
    );

    const steps = plan("Traite les tickets en attente", { desk: empty });

    expect(calls(steps)).toEqual([]);
    expect(words(steps)).toBe("Aucun ticket n'attend de réponse.");
  });

  test("caps the number of tool calls in one turn and says tickets are left", () => {
    const crowded = withTickets(...Array.from({ length: 12 }, () => REFUND));

    const steps = plan("Traite les tickets en attente", { desk: crowded, enabledTools: ALL_TOOLS });

    expect(calls(steps).length).toBeLessThanOrEqual(12);
    expect(words(steps)).toContain("il reste des tickets en attente");
  });

  test("the closing sentence depends on whether a key was missing during the turn", () => {
    const outro = plan("Traite les tickets en attente").filter((step) => step.type === "say" && step.when);

    expect(outro).toEqual([
      { type: "say", text: "C'est réglé.", when: "granted" },
      { type: "say", text: "Je n'ai pas pu tout régler : il me manque un accès dans le vault.", when: "denied" },
    ]);
  });
});

describe("a sentence it does not understand", () => {
  test("gets an honest answer and no tool call", () => {
    const steps = plan("Le temps passe vite ici");

    expect(steps.every((step) => step.type === "say")).toBe(true);
    expect(words(steps)).toContain("Je n'ai pas compris de consigne");
  });
});

describe("planReaction", () => {
  const tickets = openTickets(createDesk());

  test("a ticket that just arrived is handled on its own", () => {
    const steps = planReaction([tickets[1]], { enabledTools: CUSTOM_TOOLS, isRound: false });

    expect(calls(steps)).toEqual(["lookup_order#2", "reply_ticket#2"]);
    expect(steps[0]).toEqual({ type: "say", text: "Je regarde le ticket de Bruno." });
  });

  test("a scheduled round handles every ticket left unanswered", () => {
    const steps = planReaction(tickets, { enabledTools: CUSTOM_TOOLS, isRound: true });

    expect(calls(steps)).toEqual(["lookup_order#2", "reply_ticket#1", "reply_ticket#2", "reply_ticket#3"]);
  });

  test("a scheduled round with nothing waiting says so and does nothing", () => {
    const steps = planReaction([], { enabledTools: CUSTOM_TOOLS, isRound: true });

    expect(calls(steps)).toEqual([]);
    expect(words(steps)).toContain("aucun ticket n'attend de réponse");
  });

  test("says which tool is missing instead of acting", () => {
    const steps = planReaction([tickets[0]], { enabledTools: ["close_ticket"], isRound: false });

    expect(calls(steps)).toEqual([]);
    expect(words(steps)).toContain("« Réponse »");
  });
});
