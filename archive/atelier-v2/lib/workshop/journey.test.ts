import { describe, expect, test } from "vitest";
import {
  createJourney,
  currentMission,
  isUnlocked,
  MISSIONS,
  missionProgress,
  recordEvent,
  type Fact,
  type Journey,
  type JourneyEvent,
} from "./journey";
import { applyIncident, applyTool, createDesk } from "./desk";
import { ENTRY_EVENT_NAMES } from "./effects";
import { createWorkshop, workshopReducer, type WorkshopAction, type WorkshopState } from "./state";

function events(lines: ReadonlyArray<Partial<JourneyEvent> & { name: string }>, from: Journey = createJourney()): Journey {
  return lines.reduce<Journey>(
    (journey, line) => recordEvent(journey, { detail: "", origin: "session", isError: false, ...line }),
    from,
  );
}

function workshopAfter(actions: readonly WorkshopAction[]): WorkshopState {
  return actions.reduce(workshopReducer, createWorkshop());
}

const SET_UP: readonly WorkshopAction[] = [
  { type: "environmentCreated", id: "env_1" },
  { type: "vaultCreated", id: "vlt_1" },
  { type: "toolsConfirmed" },
  { type: "agentCreated", id: "agent_1" },
  { type: "sessionStarted", id: "sesn_1" },
];

describe("recordEvent", () => {
  test("a turn that ends without any tool call counts as a plain answer", () => {
    const journey = events([
      { name: "user.message" },
      { name: "agent.message" },
      { name: "session.status_idle", detail: "end_turn : le tour est terminé" },
    ]);

    expect(journey.facts).toContain<Fact>("answered_without_tool");
  });

  test("a turn that used a tool does not", () => {
    const journey = events([
      { name: "user.message" },
      { name: "agent.custom_tool_use" },
      { name: "session.status_idle", detail: "requires_action" },
      { name: "session.status_idle", detail: "end_turn : le tour est terminé" },
    ]);

    expect(journey.facts).toContain<Fact>("custom_tool");
    expect(journey.facts).not.toContain<Fact>("answered_without_tool");
  });

  test.each<[Partial<JourneyEvent> & { name: string }, Fact]>([
    [{ name: "agent.mcp_tool_result", origin: "mcp", detail: "Accès refusé : la clé manque", isError: true }, "key_denied"],
    [{ name: "agent.mcp_tool_result", origin: "mcp", detail: "Remboursement de 39 € émis pour Bruno." }, "refund_done"],
    [{ name: "agent.mcp_tool_result", origin: "mcp", detail: "Colis de Bruno : bloqué au dépôt." }, "mcp_ok"],
    [{ name: "agent.tool_result", origin: "sandbox", detail: "Fichier écrit." }, "sandbox_run"],
    [{ name: "agent.tool_result", origin: "sandbox", detail: "Permission to use bash has been denied.", isError: true }, "auto_denied"],
    [{ name: "agent.tool_result", origin: "web", detail: "url_not_allowed", isError: true }, "web_blocked"],
    [{ name: "agent.tool_result", origin: "web", detail: "Page lue." }, "web_ok"],
    [{ name: "agent.tool_use", detail: "read : /workspace/skills/remboursement/SKILL.md" }, "skill_loaded"],
    [{ name: "user.tool_confirmation", detail: "allow" }, "approved"],
    [{ name: "user.tool_confirmation", detail: "deny" }, "refused"],
    [{ name: "session.status_idle", detail: "budget_reached : la session est en pause" }, "budget_paused"],
    [{ name: "session.updated", detail: "budget relevé" }, "budget_raised"],
    [{ name: "agent.tool_use", detail: "write : /mnt/memory/notes.md" }, "memory_written"],
    [{ name: "agent.tool_use", detail: "read : /mnt/memory/notes.md" }, "memory_read"],
    [{ name: "session.thread_created" }, "delegated"],
    [{ name: "span.outcome_evaluation_end", detail: "satisfied : tout est bon" }, "outcome_done"],
    [{ name: ENTRY_EVENT_NAMES.webhook, origin: "entry" }, "entry_webhook"],
    [{ name: ENTRY_EVENT_NAMES.cron, origin: "entry" }, "entry_cron"],
    [{ name: "agents.update" }, "version_created"],
    [{ name: "session.status_rescheduled" }, "fault_recovered"],
    [{ name: "session.status_terminated" }, "terminated"],
    [{ name: "user.interrupt" }, "interrupted"],
  ])("%j records %s", (line, fact) => {
    expect(events([line]).facts).toContain(fact);
  });

  test("an API call is an entry point too, but teaches nothing about webhooks or crons", () => {
    const journey = events([{ name: ENTRY_EVENT_NAMES.api, origin: "entry", detail: "Traite les tickets en attente" }]);

    expect(journey.facts).toEqual([]);
  });

  test("the real result of a refund is what records refund_done", () => {
    const withRefund = applyIncident(createDesk(), { kind: "refund", customer: "Léa", subject: "Remboursez-moi.", amount: 59 });
    const known = applyTool(withRefund, { tool: "lookup_order", input: { ticket: 4 } }, []).desk;
    const refunded = applyTool(known, { tool: "create_refund", input: { ticket: 4 } }, ["paiements"]).result;

    const journey = events([{ name: "agent.mcp_tool_result", origin: "mcp", detail: refunded.text }]);

    expect(journey.facts).toContain<Fact>("refund_done");
  });

  test("the real result of a parcel tracking counts as a successful service call, not as a refund", () => {
    const tracked = applyTool(createDesk(), { tool: "track_parcel", input: { ticket: 2 } }, ["transporteur"]).result;

    const journey = events([{ name: "agent.mcp_tool_result", origin: "mcp", detail: tracked.text }]);

    expect(journey.facts).toEqual<Fact[]>(["mcp_ok"]);
  });

  test("the real refusal for a missing key is what records key_denied", () => {
    const refused = applyTool(createDesk(), { tool: "create_refund", input: { ticket: 2 } }, []).result;

    const journey = events([{ name: "agent.mcp_tool_result", origin: "mcp", detail: refused.text, isError: true }]);

    expect(journey.facts).toContain<Fact>("key_denied");
  });

  test("a refund you refused, or one the service rejected, is neither a missing key nor a success", () => {
    const journey = events([
      { name: "agent.mcp_tool_result", origin: "mcp", detail: "Permission refusée.", isError: true },
      { name: "agent.mcp_tool_result", origin: "mcp", detail: "Commande inconnue : cherche-la d'abord.", isError: true },
    ]);

    expect(journey.facts).toEqual([]);
  });

  test("facts are recorded once and the journey is not mutated", () => {
    const first = events([{ name: "agents.update" }]);
    const second = events([{ name: "agents.update" }], first);

    expect(second.facts.filter((fact) => fact === "version_created")).toHaveLength(1);
    expect(createJourney().facts).toEqual([]);
  });
});

describe("missions", () => {
  test("start with building the environment and follow the set-up steps in order", () => {
    const fresh = createJourney();

    expect(currentMission(createWorkshop(), fresh)?.id).toBe("environment");
    expect(currentMission(workshopAfter(SET_UP.slice(0, 1)), fresh)?.id).toBe("vault");
    expect(currentMission(workshopAfter(SET_UP), fresh)?.id).toBe("question");
  });

  test("advance as the learner's actions show up in the event stream", () => {
    const workshop = workshopAfter(SET_UP);
    const asked = events([{ name: "user.message" }, { name: "session.status_idle", detail: "end_turn" }]);
    const acted = events([{ name: "agent.custom_tool_use" }], asked);

    expect(currentMission(workshop, asked)?.id).toBe("first_tool");
    expect(currentMission(workshop, acted)?.id).toBe("missing_key");
  });

  test("a refused refund, then an approved one, move the learner through the vault missions", () => {
    const workshop = workshopAfter(SET_UP);
    const atMissingKey = events([
      { name: "user.message" },
      { name: "session.status_idle", detail: "end_turn" },
      { name: "agent.custom_tool_use" },
    ]);
    const denied = events(
      [{ name: "agent.mcp_tool_result", origin: "mcp", detail: "Accès refusé : la « Clé Paiements » n'est pas dans le vault.", isError: true }],
      atMissingKey,
    );
    const refunded = events(
      [{ name: "agent.mcp_tool_result", origin: "mcp", detail: "Remboursement de 59 € émis pour Léa." }],
      denied,
    );

    expect(currentMission(workshop, atMissingKey)?.id).toBe("missing_key");
    expect(currentMission(workshop, denied)?.id).toBe("add_key");
    expect(currentMission(workshop, refunded)?.id).toBe("entries");
  });

  test("the entry points mission needs a ticket that came by webhook and a scheduled round", () => {
    const workshop = workshopAfter(SET_UP);
    const upToEntries: Journey = {
      facts: ["answered_without_tool", "custom_tool", "key_denied", "refund_done", "entry_webhook"],
      turnUsedTool: false,
    };

    const afterCron = events([{ name: ENTRY_EVENT_NAMES.cron, origin: "entry" }], upToEntries);

    expect(currentMission(workshop, upToEntries)?.id).toBe("entries");
    expect(currentMission(workshop, afterCron)?.id).toBe("sandbox");
  });

  test("keep the fourteen steps of the path, in order", () => {
    expect(MISSIONS.map((mission) => mission.id)).toEqual([
      "environment",
      "vault",
      "tools",
      "agent",
      "session",
      "question",
      "first_tool",
      "missing_key",
      "add_key",
      "entries",
      "sandbox",
      "budget",
      "memory",
      "advanced",
    ]);
  });

  test("quote the exact phrases and labels the learner has to click", () => {
    const todo = (id: string): string => MISSIONS.find((mission) => mission.id === id)?.todo ?? "";

    expect(todo("question")).toContain("« Combien de tickets sont ouverts ? »");
    expect(todo("first_tool")).toContain("« Réponds au ticket d'Alice »");
    expect(todo("missing_key")).toContain("« Faire évoluer l'agent »");
    expect(todo("missing_key")).toContain("« Remboursement »");
    expect(todo("missing_key")).toContain("« Un client demande un remboursement »");
    expect(todo("add_key")).toContain("« Clé Paiements »");
    expect(todo("add_key")).toContain("« Traite les tickets en attente »");
    expect(todo("sandbox")).toContain("« Fais le bilan du support »");
    expect(todo("memory")).toContain("« Réponds aux tickets en tutoyant »");
  });

  test("report progress as done over total, and finish with no mission left", () => {
    const everything = MISSIONS.reduce<Journey>((journey) => journey, {
      facts: [
        "answered_without_tool",
        "custom_tool",
        "key_denied",
        "refund_done",
        "entry_webhook",
        "entry_cron",
        "sandbox_run",
        "approved",
        "budget_paused",
        "budget_raised",
        "memory_written",
        "memory_read",
        "delegated",
      ],
      turnUsedTool: false,
    });
    const workshop = workshopAfter(SET_UP);

    expect(missionProgress(createWorkshop(), createJourney())).toEqual({ done: 0, total: MISSIONS.length });
    expect(missionProgress(workshop, everything).done).toBe(MISSIONS.length);
    expect(currentMission(workshop, everything)).toBeNull();
  });
});

describe("isUnlocked", () => {
  test("advanced options stay hidden until their mission is reached", () => {
    const beginner = { workshop: createWorkshop(), journey: createJourney() };

    expect(isUnlocked("sandbox", beginner.workshop, beginner.journey, false)).toBe(false);
    expect(isUnlocked("budget", beginner.workshop, beginner.journey, false)).toBe(false);
  });

  test("the mission that asks for a ticket button also shows the entry points panel", () => {
    const workshop = workshopAfter(SET_UP);
    const atMissingKey = events([
      { name: "user.message" },
      { name: "session.status_idle", detail: "end_turn" },
      { name: "agent.custom_tool_use" },
    ]);

    expect(currentMission(workshop, atMissingKey)?.todo).toContain("« Points d'entrée »");
    expect(isUnlocked("entries", workshop, atMissingKey, false)).toBe(true);
  });

  test("a feature unlocks when its mission becomes the current one", () => {
    const workshop = workshopAfter(SET_UP);
    const atMissingKey = events([
      { name: "user.message" },
      { name: "session.status_idle", detail: "end_turn" },
      { name: "agent.custom_tool_use" },
    ]);

    expect(isUnlocked("evolve", workshop, atMissingKey, false)).toBe(true);
    expect(isUnlocked("sandbox", workshop, atMissingKey, false)).toBe(false);
  });

  test("free mode unlocks everything", () => {
    expect(isUnlocked("advanced", createWorkshop(), createJourney(), true)).toBe(true);
  });
});
