import { describe, expect, test } from "vitest";
import { TOOL_CATALOG, type KeyId, type ToolId } from "./catalog";
import { applyIncident, applyTool, createDesk, openTickets, ticketById, type Desk, type Incident } from "./desk";
import { AGENT_DESK, AGENT_HOME } from "./layout";
import { planTurn, type PlanContext, type PlanStep } from "./planner";
import { applyCommand, applyEffect, createRun } from "./run";
import { TEAM_MIN_CALLS } from "./team";
import { buildTimeline, flatten, isGate, type Effect, type SandboxPolicy, type Step } from "./timeline";

const TOOLS: readonly ToolId[] = ["reply_ticket", "lookup_order", "close_ticket", "escalate_ticket"];
const ALL_TOOLS: readonly ToolId[] = TOOL_CATALOG.map((tool) => tool.id);
const REFUND: Incident = { kind: "refund", customer: "Léa", subject: "Remboursez-moi.", amount: 59 };
const QUESTION: Incident = { kind: "question", customer: "Emma", subject: "Une question ?", amount: null };
const first = (): number => 0;

function plan(task: string, overrides: Partial<PlanContext> = {}): PlanStep[] {
  return planTurn(task, { enabledTools: TOOLS, desk: createDesk(), random: first, ...overrides });
}

function effectsOf(steps: readonly Step[], decision: "allow" | "deny" = "allow"): Effect[] {
  return flatten(steps, decision).flatMap((beat) => beat.effects);
}

function names(effects: readonly Effect[]): string[] {
  return effects.flatMap((effect) => (effect.type === "event" ? [effect.name] : []));
}

interface BuildOptions {
  sandbox?: SandboxPolicy;
  canDelegate?: boolean;
  memory?: string[];
  desk?: Desk;
  keys?: KeyId[];
}

function build(steps: readonly PlanStep[], options: BuildOptions = {}) {
  return buildTimeline("tâche", steps, { desk: createDesk(), keys: [], start: AGENT_HOME, ...options });
}

function replies(steps: readonly PlanStep[]) {
  return steps.flatMap((step) => (step.type === "call" && step.tool === "reply_ticket" ? [step.input] : []));
}

describe("the sandbox", () => {
  test("a report on the support desk runs a script in the container, then writes a file", () => {
    const steps = plan("Fais le bilan du support", { hasSandbox: true });

    expect(steps.flatMap((step) => (step.type === "sandbox" ? [step.tool] : []))).toEqual(["bash", "write"]);
    expect(steps.find((step) => step.type === "sandbox")).toMatchObject({
      target: "python bilan_support.py",
      output: "3 tickets ouverts, 0 résolu, 0 transmis à l'équipe",
    });
    const effects = effectsOf(build(steps, { sandbox: "always_allow" }).beats);
    expect(names(effects)).toEqual(expect.arrayContaining(["agent.tool_use", "agent.tool_result"]));
    expect(effects).toContainEqual({ type: "file", name: "bilan_support.md" });
    expect(names(effects)).not.toContain("user.custom_tool_result");
  });

  test("without a sandbox the agent says it cannot do it", () => {
    const steps = plan("Fais le bilan du support", { hasSandbox: false });

    expect(steps.every((step) => step.type === "say")).toBe(true);
  });
});

describe("human approval of sandbox calls", () => {
  const steps = plan("Fais le bilan du support", { hasSandbox: true });

  test("under always_ask each sandbox call stops at a gate", () => {
    const timeline = build(steps, { sandbox: "always_ask" });

    expect(timeline.beats.some(isGate)).toBe(true);
    expect(build(steps, { sandbox: "always_allow" }).beats.some(isGate)).toBe(false);
  });

  test("allowing lets the call run", () => {
    const effects = effectsOf(build(steps, { sandbox: "always_ask" }).beats, "allow");

    expect(effects).toContainEqual({ type: "approval", request: { tool: "bash", target: "python bilan_support.py" } });
    expect(names(effects)).toContain("user.tool_confirmation");
    expect(effects).toContainEqual({ type: "file", name: "bilan_support.md" });
  });

  test("denying returns an error result and skips the rest of the sandbox work", () => {
    const effects = effectsOf(build(steps, { sandbox: "always_ask" }).beats, "deny");

    expect(effects.some((effect) => effect.type === "file")).toBe(false);
    expect(effects.filter((effect) => effect.type === "approval" && effect.request !== null)).toHaveLength(1);
    expect(effects.some((effect) => effect.type === "bubble" && effect.text?.includes("prêt"))).toBe(false);
    expect(effects.find((effect) => effect.type === "event" && effect.name === "agent.tool_result")).toMatchObject({
      isError: true,
    });
  });
});

describe("memory", () => {
  test("a new tone preference is written to the notebook, and the replies use it", () => {
    const steps = plan("Réponds aux tickets en tutoyant", { memory: [] });

    expect(steps).toContainEqual({ type: "memory", op: "write", note: "Ton préféré : tutoiement" });
    expect(replies(steps).map((input) => input.tone)).toEqual(["tu", "tu", "tu"]);
    expect(effectsOf(build(steps).beats)).toContainEqual({ type: "memory", notes: ["Ton préféré : tutoiement"] });
  });

  test("without a memory store the tone is used but nothing is written", () => {
    const steps = plan("Réponds aux tickets en tutoyant", { memory: null });

    expect(steps.some((step) => step.type === "memory")).toBe(false);
    expect(replies(steps).every((input) => input.tone === "tu")).toBe(true);
  });

  test("in a later session the agent rereads its notes on the first turn and keeps the tone", () => {
    const steps = plan("Traite les tickets en attente", { memory: ["Ton préféré : tutoiement"], isFirstTurn: true });

    expect(steps[0]).toEqual({ type: "memory", op: "read" });
    expect(replies(steps).map((input) => input.tone)).toEqual(["tu", "tu", "tu"]);
    expect(steps.some((step) => step.type === "memory" && step.op === "write")).toBe(false);
    expect(steps).toContainEqual({ type: "say", text: "Je me souviens que tu préfères le tutoiement : je garde ce ton." });
  });

  test("the notes are only reread on the first turn of a session", () => {
    const steps = plan("Traite les tickets en attente", { memory: ["Ton préféré : tutoiement"], isFirstTurn: false });

    expect(steps.some((step) => step.type === "memory")).toBe(false);
  });

  test.each(["Vouvoie les clients", "Réponds aux tickets en vouvoyant"])("%s sets the tone back and replaces the note", (task) => {
    const steps = plan(task, { memory: ["Ton préféré : tutoiement"] });

    expect(steps).toContainEqual({ type: "memory", op: "write", note: "Ton préféré : vouvoiement" });
    expect(replies(steps).every((input) => input.tone === "vous")).toBe(true);
  });

  test("asking again for the remembered tone writes nothing new", () => {
    const steps = plan("Réponds aux tickets en tutoyant", { memory: ["Ton préféré : tutoiement"] });

    expect(steps.some((step) => step.type === "memory" && step.op === "write")).toBe(false);
  });

  test("with no preference the replies carry no tone at all", () => {
    expect(replies(plan("Traite les tickets en attente", { memory: [] }))).toEqual([{ ticket: 1 }, { ticket: 2 }, { ticket: 3 }]);
  });
});

describe("delegation", () => {
  const everything = plan("Traite les tickets en attente");

  test("the replies of a big job are shared between copies working in parallel", () => {
    const timeline = build(everything, { canDelegate: true });
    const effects = effectsOf(timeline.beats);

    expect(replies(everything).length).toBeGreaterThanOrEqual(TEAM_MIN_CALLS);
    expect(names(effects).filter((name) => name === "session.thread_created")).toHaveLength(2);
    expect(effects.some((effect) => effect.type === "helpers" && effect.helpers.length === 2)).toBe(true);
    expect(effects.findLast((effect) => effect.type === "helpers")).toEqual({ type: "helpers", helpers: [] });
    expect(openTickets(timeline.desk)).toEqual([]);
  });

  test("the copies only take the tools that act on the desk: the order is looked up by the agent's own call", () => {
    const effects = effectsOf(build(everything, { canDelegate: true }).beats);

    const details = effects.flatMap((effect) =>
      effect.type === "event" && effect.name === "agent.custom_tool_use" ? [effect.detail] : [],
    );

    expect(details[0]).toBe('lookup_order({"ticket":2})');
    expect(details.slice(1).every((detail) => detail.startsWith("[copie"))).toBe(true);
  });

  test("a small job, or an agent that cannot delegate, works alone", () => {
    const small = plan("Réponds aux questions");

    expect(effectsOf(build(small, { canDelegate: true }).beats).some((effect) => effect.type === "helpers")).toBe(false);
    expect(effectsOf(build(everything).beats).some((effect) => effect.type === "helpers")).toBe(false);
  });

  test("a reply that depends on a refused refund is not handed to a copy", () => {
    const desk = applyIncident(createDesk(), REFUND);
    const steps = plan("Traite les tickets en attente", { desk, enabledTools: ALL_TOOLS });

    const timeline = build(steps, { canDelegate: true, desk });

    expect(ticketById(timeline.desk, 4)?.status).toBe("open");
    expect(openTickets(timeline.desk)).toHaveLength(1);
  });
});

describe("session state", () => {
  test("a new session keeps the desk and the memory but nothing else", () => {
    const desk = applyTool(createDesk(), { tool: "reply_ticket", input: { ticket: 1 } }, []).desk;
    const used = [
      { type: "desk", desk } as const,
      { type: "memory", notes: ["Ton préféré : tutoiement"] } as const,
      { type: "file", name: "bilan_support.md" } as const,
      { type: "event", name: "agent.message", detail: "x", origin: "agent" } as const,
    ].reduce(applyEffect, applyCommand(createRun(), { type: "spend", cents: 3 }));

    const fresh = applyCommand(used, { type: "newSession", budgetCents: 10 });

    expect(fresh).toMatchObject({ desk, memory: ["Ton préféré : tutoiement"], files: [], events: [], spentCents: 0, budgetCents: 10 });
  });

  test("spending, budget changes and turn counting", () => {
    const state = [
      { type: "budgetSet", cents: 10 } as const,
      { type: "spend", cents: 1 } as const,
      { type: "spend", cents: 1 } as const,
      { type: "turnStarted" } as const,
    ].reduce(applyCommand, createRun());

    expect(state).toMatchObject({ budgetCents: 10, spentCents: 2, turnCount: 1 });
  });

  test("terminal, approval, helpers and outcome are shown then cleared", () => {
    const shown = [
      { type: "terminal", lines: ["$ ls"] } as const,
      { type: "approval", request: { tool: "bash", target: "ls" } } as const,
      { type: "memoryUse", isActive: true } as const,
      { type: "helpers", helpers: [{ id: 1, position: AGENT_HOME, moveMs: 0, carrying: null }] } as const,
    ].reduce(applyEffect, createRun());

    expect(shown).toMatchObject({ terminal: ["$ ls"], approval: { tool: "bash" }, isUsingMemory: true });
    expect(shown.helpers).toHaveLength(1);
    expect(applyEffect(shown, { type: "outcome", outcome: null }).outcome).toBeNull();
  });
});

describe("a file mounted in the session", () => {
  const mounted = { hasSandbox: true, hasPlan: true };

  test("the agent reads the mounted FAQ, then answers every open question and nothing else", () => {
    const steps = plan("Réponds en suivant la FAQ", mounted);

    expect(steps.find((step) => step.type === "sandbox")).toMatchObject({ tool: "read", target: "/mnt/faq.md" });
    expect(steps.findIndex((step) => step.type === "sandbox")).toBeLessThan(steps.findIndex((step) => step.type === "call"));
    expect(replies(steps)).toEqual([{ ticket: 1 }, { ticket: 3 }]);
  });

  test("with no file mounted there is no FAQ to follow", () => {
    expect(plan("Réponds en suivant la FAQ", { hasSandbox: true }).every((step) => step.type === "say")).toBe(true);
  });

  test("with no question waiting it reads the FAQ and says so", () => {
    const desk = applyTool(applyTool(createDesk(), { tool: "reply_ticket", input: { ticket: 1 } }, []).desk, { tool: "reply_ticket", input: { ticket: 3 } }, []).desk;

    const steps = plan("Réponds en suivant la FAQ", { ...mounted, desk });

    expect(replies(steps)).toEqual([]);
    expect(steps.at(-1)).toEqual({ type: "say", text: "Aucune question n'attend de réponse." });
  });

  test("without the reply tool it names the missing tool", () => {
    const steps = plan("Réponds en suivant la FAQ", { ...mounted, enabledTools: ["lookup_order"] });

    expect(replies(steps)).toEqual([]);
    expect(steps.some((step) => step.type === "say" && step.text.includes("« Réponse »"))).toBe(true);
  });
});

describe("a skill", () => {
  const desk = [REFUND, { ...REFUND, customer: "Malik" }].reduce(applyIncident, createDesk());
  const skilled = { desk, enabledTools: ALL_TOOLS, hasSandbox: true, hasSkill: true };

  test("with the skill the agent loads it at its library before the first refund, once per turn", () => {
    const steps = plan("Traite les remboursements", skilled);

    const loads = steps.filter((step) => step.type === "sandbox");
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ tool: "read", target: "/workspace/skills/remboursement/SKILL.md", place: "library" });
    expect(steps.findIndex((step) => step.type === "sandbox")).toBeLessThan(steps.findIndex((step) => step.type === "call"));
    expect(effectsOf(build(steps, { sandbox: "always_allow", desk, keys: ["paiements"] }).beats)).toContainEqual({
      type: "spot",
      spot: "library",
    });
  });

  test("the skill is not loaded for tickets that are not refunds", () => {
    expect(plan("Réponds aux questions", skilled).some((step) => step.type === "sandbox")).toBe(false);
  });

  test("without the skill, or without a sandbox to read it from, nothing is loaded", () => {
    expect(plan("Traite les remboursements", { ...skilled, hasSkill: false }).some((step) => step.type === "sandbox")).toBe(false);
    expect(plan("Traite les remboursements", { ...skilled, hasSandbox: false }).some((step) => step.type === "sandbox")).toBe(false);
  });
});

describe("web tools and allowed domains", () => {
  const web = { hasWeb: true, hasSandbox: true };

  test("a search returns results from the allowed site when the network is open", () => {
    const steps = plan("Cherche le statut du transporteur sur le web", { ...web, isNetworkOpen: true });

    expect(steps.find((step) => step.type === "web")).toMatchObject({
      tool: "web_search",
      isError: false,
      output: expect.stringContaining("transporteur.example"),
    });
    const effects = effectsOf(build(steps, { sandbox: "always_allow" }).beats);
    expect(effects).toContainEqual({ type: "hop", hop: { from: "agent", to: "web", label: "web_search", tone: "call" } });
    expect(effects.some((effect) => effect.type === "move" && !effect.who && effect.to !== AGENT_DESK && effect.to !== AGENT_HOME)).toBe(false);
    expect(effects.find((effect) => effect.type === "event" && effect.name === "agent.tool_result")).toMatchObject({ origin: "web" });
  });

  test("an isolated environment starves the search even though the tool is enabled", () => {
    const steps = plan("Cherche le statut du transporteur sur le web", { ...web, isNetworkOpen: false });

    expect(steps.find((step) => step.type === "web")).toMatchObject({ output: expect.stringContaining("isolé") });
  });

  test("fetching a page outside the allowed domains is refused", () => {
    const blocked = plan("Lis la page blog-inconnu.example", { ...web, isNetworkOpen: true });
    const allowed = plan("Lis la page transporteur.example", { ...web, isNetworkOpen: true });
    const isolated = plan("Lis la page transporteur.example", { ...web, isNetworkOpen: false });

    expect(blocked.find((step) => step.type === "web")).toMatchObject({ isError: true, output: expect.stringContaining("url_not_allowed") });
    expect(allowed.find((step) => step.type === "web")).toMatchObject({ tool: "web_fetch", isError: false });
    expect(isolated.find((step) => step.type === "web")).toMatchObject({ isError: true });
  });

  test("without the web tools the agent says so", () => {
    expect(plan("Cherche le statut du transporteur sur le web").every((step) => step.type === "say")).toBe(true);
    expect(plan("Lis la page transporteur.example").every((step) => step.type === "say")).toBe(true);
  });
});

describe("the auto permission policy", () => {
  const auto = { sandbox: "auto" as const };
  const sandbox = { hasSandbox: true };

  test("a safe call runs without asking", () => {
    const timeline = build(plan("Fais le bilan du support", sandbox), auto);

    expect(timeline.beats.some(isGate)).toBe(false);
    expect(effectsOf(timeline.beats)).toContainEqual({ type: "verdict", verdict: { text: "auto : jugé sûr", tone: "ok" } });
    expect(effectsOf(timeline.beats)).toContainEqual({ type: "file", name: "bilan_support.md" });
  });

  test("a high-risk call is denied by the platform and nobody is asked", () => {
    const timeline = build(plan("Vide le dossier de travail", sandbox), auto);
    const effects = effectsOf(timeline.beats);

    expect(timeline.beats.some(isGate)).toBe(false);
    expect(effects.some((effect) => effect.type === "terminal" && effect.lines !== null)).toBe(false);
    expect(effects.find((effect) => effect.type === "event" && effect.name === "agent.tool_result")).toMatchObject({
      isError: true,
      detail: "Permission to use bash has been denied.",
    });
  });

  test("an unclear call falls back to asking you", () => {
    const timeline = build(plan("Installe un paquet", sandbox), auto);

    expect(timeline.beats.some(isGate)).toBe(true);
    expect(effectsOf(timeline.beats)).toContainEqual({ type: "verdict", verdict: { text: "auto : pas de certitude", tone: "ask" } });
  });

  test("under always_allow the same risky command simply runs", () => {
    const effects = effectsOf(build(plan("Vide le dossier de travail", sandbox), { sandbox: "always_allow" }).beats);

    expect(effects).toContainEqual({ type: "terminal", lines: ["$ rm -rf /workspace"] });
  });

  test("without a sandbox a risky command is not even attempted", () => {
    expect(plan("Installe un paquet").every((step) => step.type === "say")).toBe(true);
  });

  test("closing unwanted messages is never mistaken for wiping the working folder", () => {
    const desk = applyIncident(createDesk(), { kind: "spam", customer: "Promo Flash", subject: "Gagnez vite !", amount: null });

    const steps = plan("Supprime les messages indésirables", { ...sandbox, desk });

    expect(steps.some((step) => step.type === "sandbox")).toBe(false);
    expect(steps.some((step) => step.type === "call" && step.tool === "close_ticket")).toBe(true);
  });
});

describe("the scenario end to end", () => {
  test("a refund request is looked up by your code, refunded by the payment service, then answered", () => {
    const desk = applyIncident(createDesk(), QUESTION);
    const withRefund = applyIncident(desk, REFUND);
    const steps = plan("Réponds au ticket de Léa", { desk: withRefund, enabledTools: ALL_TOOLS });

    const timeline = build(steps, { desk: withRefund, keys: ["paiements"] });
    const stream = names(effectsOf(timeline.beats)).filter((name) => name.startsWith("agent.") && name.endsWith("_use"));

    expect(stream).toEqual(["agent.custom_tool_use", "agent.mcp_tool_use", "agent.custom_tool_use"]);
    expect(ticketById(timeline.desk, 5)).toMatchObject({ isOrderKnown: true, isRefunded: true, status: "resolved" });
  });

  test("without the payment key the customer gets no answer promising a refund", () => {
    const withRefund = applyIncident(createDesk(), REFUND);
    const steps = plan("Réponds au ticket de Léa", { desk: withRefund, enabledTools: ALL_TOOLS });

    const timeline = build(steps, { desk: withRefund });
    const spoken = effectsOf(timeline.beats).flatMap((effect) => (effect.type === "bubble" && effect.text ? [effect.text] : []));

    expect(ticketById(timeline.desk, 4)).toMatchObject({ isOrderKnown: true, isRefunded: false, status: "open" });
    expect(spoken).toContain("Je n'ai pas pu tout régler : il me manque un accès dans le vault.");
    expect(spoken).not.toContain("C'est réglé.");
  });
});
