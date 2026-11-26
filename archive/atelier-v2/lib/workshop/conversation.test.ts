import { describe, expect, test } from "vitest";
import type { ToolId } from "./catalog";
import { applyIncident, applyTool, createDesk, type Desk } from "./desk";
import { planTurn, type PlanContext, type PlanStep } from "./planner";

const TOOLS: readonly ToolId[] = ["reply_ticket", "lookup_order"];

function ask(text: string, overrides: Partial<PlanContext> = {}): PlanStep[] {
  return planTurn(text, { enabledTools: TOOLS, desk: createDesk(), random: () => 0, ...overrides });
}

function words(steps: readonly PlanStep[]): string {
  return steps.flatMap((step) => (step.type === "say" ? [step.text] : [])).join(" ");
}

function acts(steps: readonly PlanStep[]): boolean {
  return steps.some((step) => step.type !== "say");
}

function settled(tool: ToolId): Desk {
  return createDesk().tickets.reduce(
    (desk, ticket) => applyTool(desk, { tool, input: { ticket: ticket.id } }, []).desk,
    createDesk(),
  );
}

describe("questions are answered without acting", () => {
  test("« Combien de tickets sont ouverts ? » gets a count by kind, and no tool call", () => {
    const steps = ask("Combien de tickets sont ouverts ?");

    expect(acts(steps)).toBe(false);
    expect(words(steps)).toBe("3 tickets sont ouverts : 2 questions, 1 colis non reçu.");
  });

  test.each(["combien de tickets sont ouverts", "Que contient la file ?", "Y a-t-il des clients en attente ?"])(
    "%s is understood as the same question",
    (text) => {
      const steps = ask(text);

      expect(acts(steps)).toBe(false);
      expect(words(steps)).toContain("3 tickets sont ouverts");
    },
  );

  test("every kind of waiting ticket is named, in the singular when there is only one", () => {
    const answered = applyTool(createDesk(), { tool: "reply_ticket", input: { ticket: 1 } }, []).desk;
    const desk = [
      { kind: "refund", customer: "Léa", subject: "Remboursez-moi.", amount: 59 } as const,
      { kind: "spam", customer: "Promo Flash", subject: "Gagnez vite !", amount: null } as const,
    ].reduce(applyIncident, answered);

    const answer = words(ask("Combien de tickets sont ouverts ?", { desk }));

    expect(answer).toBe(
      "4 tickets sont ouverts : 1 question, 1 colis non reçu, 1 demande de remboursement, 1 message indésirable.",
    );
  });

  test("an empty queue is described as empty", () => {
    const steps = ask("Combien de tickets sont ouverts ?", { desk: settled("reply_ticket") });

    expect(acts(steps)).toBe(false);
    expect(words(steps)).toBe("Aucun ticket n'est ouvert : la file est vide.");
  });

  test("tickets handed to the team are mentioned apart from the open ones", () => {
    const answer = words(ask("Comment va la file ?", { desk: settled("escalate_ticket") }));

    expect(answer).toContain("la file est vide");
    expect(answer).toContain("3 tickets transmis à l'équipe attendent un humain");
  });

  test("a question about its tools lists them, with what else it was given", () => {
    const steps = ask("Quels outils as-tu ?", { hasSandbox: true, hasWeb: true, hasSkill: true });

    expect(acts(steps)).toBe(false);
    expect(words(steps)).toContain("J'ai 2 outils pour le support : Réponse, Commande.");
    expect(words(steps)).toMatch(/bac à sable.*recherche web.*skill/);
  });

  test.each(["Bonjour", "Merci beaucoup", "Qui es-tu ?"])("%s gets a reply and nothing else", (text) => {
    const steps = ask(text);

    expect(acts(steps)).toBe(false);
    expect(steps.length).toBeGreaterThan(0);
  });

  test("a question about its memory reads back its notes", () => {
    expect(words(ask("De quoi te souviens-tu ?", { memory: ["Ton préféré : tutoiement"] }))).toContain("tutoiement");
    expect(words(ask("De quoi te souviens-tu ?", { memory: [] }))).toContain("vide");
    expect(words(ask("De quoi te souviens-tu ?"))).toContain("pas de carnet");
  });

  test("a question it cannot answer says so honestly instead of improvising", () => {
    const steps = ask("Quelle est la capitale du Pérou ?");

    expect(acts(steps)).toBe(false);
    expect(words(steps)).toContain("simulé");
  });
});

describe("only an explicit request leads to an action", () => {
  test("a request phrased as a question still gets done", () => {
    const steps = ask("Peux-tu répondre au ticket d'Alice ?");

    expect(steps.filter((step) => step.type === "call")).toHaveLength(1);
  });

  test("a greeting followed by a request is a request", () => {
    expect(acts(ask("Bonjour, réponds au ticket d'Alice"))).toBe(true);
  });
});
