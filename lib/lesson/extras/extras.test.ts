import { describe, expect, test } from "vitest";
import { COMPACT_AT_SHARE, usedTokens } from "@/lib/workshop/context";
import { COMPACTION_LESSON } from "./compaction";
import { AGENT_HOME, LIBRARY_STAND, SESSION_ZONE, WORKBENCH_STAND } from "@/lib/workshop/layout";
import { SESSION_LESSON } from "../base/session";
import { lessonView, stepCount, type LessonView } from "../play";
import type { Lesson } from "../types";
import { BUDGET_LESSON } from "./budget";
import { CONTAINER_LESSON } from "./container";
import { CRON_LESSON } from "./cron";
import { DELEGATION_LESSON } from "./delegation";
import { FAULTS_LESSON } from "./faults";
import { EXTRA_LESSONS } from "./index";
import { MEMORY_LESSON } from "./memory";
import { OUTCOME_LESSON } from "./outcome";
import { SCENE_PIECES } from "./shared";
import { SKILL_LESSON } from "./skill";
import { VAULT_LESSON } from "./vault";
import { VERSIONS_LESSON } from "./versions";
import { WEB_LESSON } from "./web";
import { WEBHOOK_LESSON } from "./webhook";

const MIN_STEPS = 3;
const MAX_STEPS = 6;

/** The view once the step with this id has played. */
function at(lesson: Lesson, stepId: string): LessonView {
  const index = lesson.steps.findIndex((step) => step.id === stepId);
  if (index < 0) throw new Error(`No step "${stepId}" in lesson "${lesson.id}"`);
  return lessonView(lesson, index);
}

function atEnd(lesson: Lesson): LessonView {
  return lessonView(lesson, stepCount(lesson) - 1);
}

function eventNames(view: LessonView): string[] {
  return view.run.events.map((line) => line.name);
}

function pileKinds(view: LessonView): string[] {
  return view.run.context.blocks.map((block) => block.kind);
}

function pileText(view: LessonView): string {
  return view.run.context.blocks.map((block) => block.text).join("\n");
}

const CHAPTERS = EXTRA_LESSONS.map((lesson) => [lesson.id, lesson] as const);

describe("every extra chapter", () => {
  test("is listed in the order of the table of contents", () => {
    expect(EXTRA_LESSONS.map((lesson) => lesson.id)).toEqual([
      "webhook",
      "cron",
      "turns",
      "resume",
      "interrupt",
      "approval",
      "container",
      "secret",
      "budget",
      "compaction",
      "memory",
      "delegation",
      "outcome",
      "faults",
      "versions",
      "web",
      "skill",
    ]);
  });

  test.each(CHAPTERS)("%s has between three and six steps", (_id, lesson) => {
    expect(lesson.steps.length).toBeGreaterThanOrEqual(MIN_STEPS);
    expect(lesson.steps.length).toBeLessThanOrEqual(MAX_STEPS);
  });

  test.each(CHAPTERS)("%s starts where the main lesson ended: pieces placed, session open, agent in bed", (_id, lesson) => {
    const first = lessonView(lesson, 0);

    expect([...first.pieces]).toEqual(expect.arrayContaining([...SCENE_PIECES]));
    expect(pileKinds(first).slice(0, 2)).toEqual(["system", "tools"]);
    expect(first.run.actor.position).toEqual(AGENT_HOME);
    expect(first.run.status).toBe("idle");
  });

  test.each(CHAPTERS)("%s never walks the agent out of its room", (_id, lesson) => {
    const destinations = lesson.steps.flatMap((step) =>
      (step.actions ?? []).flatMap((action) => (action.type === "move" && !action.who ? [action.to] : [])),
    );

    for (const point of destinations) {
      expect(point.x).toBeGreaterThanOrEqual(SESSION_ZONE.x);
      expect(point.x).toBeLessThanOrEqual(SESSION_ZONE.x + SESSION_ZONE.width);
      expect(point.y).toBeGreaterThanOrEqual(SESSION_ZONE.y);
      expect(point.y).toBeLessThanOrEqual(SESSION_ZONE.y + SESSION_ZONE.depth);
    }
  });

  test.each(CHAPTERS)("%s leaves the session idle, with no approval pending and no call in flight", (_id, lesson) => {
    const { run } = atEnd(lesson);

    expect(run.status).toBe("idle");
    expect(run.approval).toBeNull();
    expect(run.hop).toBeNull();
    expect(run.helpers).toEqual([]);
  });
});

describe("webhook", () => {
  test("the ticket reaches the support desk and your server before anything enters the room", () => {
    const arrived = at(WEBHOOK_LESSON, "ticket");

    expect(arrived.run.hop).toMatchObject({ from: "desk", to: "webhook" });
    expect(arrived.run.events).toEqual([]);
    expect(arrived.run.actor.position).toEqual(AGENT_HOME);
  });

  test("your server, not a click, sends the user.message that wakes the agent", () => {
    const sent = at(WEBHOOK_LESSON, "message");

    expect(sent.run.hop).toMatchObject({ from: "webhook", to: "agent", label: "user.message" });
    expect(eventNames(sent)).toEqual(["user.message", "session.status_running"]);
  });

  test("the turn then follows the same order of events as the main lesson", () => {
    expect(eventNames(atEnd(WEBHOOK_LESSON))).toEqual(eventNames(atEnd(SESSION_LESSON)));
  });
});

describe("cron", () => {
  test("a firing resets the context to the agent's configuration plus the initial message", () => {
    const before = at(CRON_LESSON, "clock");
    const fired = at(CRON_LESSON, "firing");

    expect(pileKinds(before)).toEqual(["system", "tools", "user", "tool_use", "tool_result", "assistant"]);
    expect(pileKinds(fired)).toEqual(["system", "tools", "user"]);
    expect(pileText(fired)).not.toContain("Alice");
  });

  test("the clock rings on Anthropic's side: the message comes from the clock, not from your backend", () => {
    const fired = at(CRON_LESSON, "firing");

    expect([...fired.pieces]).toContain("clock");
    expect(fired.run.activeEntry).toBe("cron");
    expect(fired.run.hop).toMatchObject({ from: "cron", to: "agent" });
  });

  test("a custom tool call waits until Anthropic's webhook lets your backend answer it", () => {
    const waiting = at(CRON_LESSON, "nobody");
    const noticed = at(CRON_LESSON, "notice");
    const answered = at(CRON_LESSON, "answer");

    expect(eventNames(waiting).slice(-2)).toEqual(["agent.custom_tool_use", "session.status_idle"]);
    expect(waiting.run.hop).toBeNull();
    expect(noticed.run.hop).toMatchObject({ from: "agent", to: "app" });
    expect(eventNames(noticed)).toEqual(eventNames(waiting));
    expect(eventNames(answered).slice(-2)).toEqual(["user.custom_tool_result", "session.status_running"]);
  });
});

describe("vault", () => {
  test("without a credential the service refuses the connection: a session error, and no tool call", () => {
    const denied = at(VAULT_LESSON, "denied");
    const error = denied.run.events.find((line) => line.name === "session.error");

    expect(denied.facts.vaultKeys).toEqual([]);
    expect(denied.run.activeKey).toEqual({ key: "paiements", isDenied: true });
    expect(denied.run.hop).toMatchObject({ from: "vault", to: "service:paiements", tone: "error" });
    expect(error).toMatchObject({ isError: true });
    expect(error?.detail).toContain("mcp_authentication_failed_error");
    expect(eventNames(denied)).not.toContain("agent.mcp_tool_use");
  });

  test("the session survives the refused connection: the agent still answers, without the tool", () => {
    expect(eventNames(at(VAULT_LESSON, "denied")).slice(-2)).toEqual(["agent.message", "session.status_idle"]);
  });

  test("the refund succeeds once the credential is in the vault", () => {
    const allowed = at(VAULT_LESSON, "allowed");
    const results = allowed.run.events.filter((line) => line.name === "agent.mcp_tool_result");

    expect(allowed.facts.vaultKeys).toEqual(["paiements"]);
    expect(allowed.run.activeKey).toEqual({ key: "paiements", isDenied: false });
    expect(allowed.run.hop).toMatchObject({ from: "vault", to: "service:paiements" });
    expect(results.map((line) => line.isError)).toEqual([false]);
  });

  test("the approval pause sits between the tool use and its result", () => {
    const secondAttempt = eventNames(atEnd(VAULT_LESSON)).slice(eventNames(at(VAULT_LESSON, "credential")).length);

    expect(secondAttempt).toEqual([
      "user.message",
      "session.status_running",
      "agent.mcp_tool_use",
      "session.status_idle",
      "user.tool_confirmation",
      "session.status_running",
      "agent.mcp_tool_result",
      "agent.message",
      "session.status_idle",
    ]);
  });

  test("the session waits for your approval, and the call only leaves once you allow it", () => {
    const asked = at(VAULT_LESSON, "approval");
    const allowed = at(VAULT_LESSON, "allowed");

    expect(asked.run.approval).not.toBeNull();
    expect(asked.run.status).toBe("waiting_approval");
    expect(asked.run.hop?.to).toBe("vault");
    expect(allowed.run.approval).toBeNull();
    expect(allowed.run.status).toBe("running");
  });

  test("the third-party tool never goes through your backend", () => {
    const names = eventNames(atEnd(VAULT_LESSON));

    expect(names).not.toContain("agent.custom_tool_use");
    expect(names).not.toContain("user.custom_tool_result");
  });
});

describe("container", () => {
  test("built-in tools run in the room: tool use and result, with no round trip to your backend", () => {
    const names = eventNames(atEnd(CONTAINER_LESSON));

    expect(names).toEqual([
      "user.message",
      "session.status_running",
      "agent.tool_use",
      "agent.tool_result",
      "agent.tool_use",
      "agent.tool_result",
      "agent.message",
      "session.status_idle",
    ]);
  });

  test("the agent stands at the workbench while bash runs, and the terminal shows the command", () => {
    const running = at(CONTAINER_LESSON, "bash");

    expect([...running.pieces]).toContain("bench");
    expect(running.run.actor.position).toEqual(WORKBENCH_STAND);
    expect(running.run.terminal?.[0]).toContain("/mnt/session/uploads/tickets.csv");
    expect(running.run.verdict?.tone).toBe("ok");
  });

  test("the result and the written file stay in the session: nothing travels to your backend", () => {
    const result = at(CONTAINER_LESSON, "result");
    const written = at(CONTAINER_LESSON, "file");

    expect(result.run.hop).toBeNull();
    expect(written.run.hop).toBeNull();
    expect(written.run.files).toEqual(["bilan.md"]);
    expect(written.facts.hasMountedFile).toBe(true);
  });
});

describe("budget", () => {
  test("the session pauses once the spend has reached the cap, right after session.usage", () => {
    const paused = at(BUDGET_LESSON, "paused");
    const lastIdle = paused.run.events.at(-1);

    expect(paused.run.spentCents).toBeGreaterThanOrEqual(paused.run.budgetCents ?? Infinity);
    expect(paused.run.status).toBe("paused_budget");
    expect(eventNames(paused).slice(-4)).toEqual([
      "user.custom_tool_result",
      "session.thread_status_idle",
      "session.usage",
      "session.status_idle",
    ]);
    expect(lastIdle?.detail).toContain("budget_reached");
  });

  test("the model is not called again while the session is paused", () => {
    const beforePause = at(BUDGET_LESSON, "spend");
    const paused = at(BUDGET_LESSON, "paused");

    expect(paused.run.context.requestCount).toBe(beforePause.run.context.requestCount);
  });

  test("raising the cap resumes the paused session without losing its context", () => {
    const paused = at(BUDGET_LESSON, "paused");
    const resumed = at(BUDGET_LESSON, "raise");

    expect(resumed.run.budgetCents).toBeGreaterThan(resumed.run.spentCents);
    expect(resumed.run.status).toBe("running");
    expect(eventNames(resumed).slice(-2)).toEqual(["session.updated", "session.status_running"]);
    expect(resumed.run.context.blocks).toEqual(paused.run.context.blocks);
    expect(resumed.run.context.requestCount).toBe(paused.run.context.requestCount + 1);
  });
});

describe("memory", () => {
  test("the agent writes the note with a file tool, in the mounted directory", () => {
    const written = at(MEMORY_LESSON, "write");
    const toolUse = written.run.events.find((line) => line.name === "agent.tool_use");

    expect(toolUse?.detail).toContain("/mnt/memory/");
    expect(written.run.memory).toEqual(["Tutoyer les clients."]);
    expect(written.run.isUsingMemory).toBe(true);
  });

  test("a new session starts with an empty context but keeps the notebook", () => {
    const next = at(MEMORY_LESSON, "new-session");

    expect(pileKinds(next)).toEqual(["system", "tools"]);
    expect(pileText(next)).not.toContain("Tutoyer");
    expect(next.run.events).toEqual([]);
    expect(next.run.memory).toEqual(["Tutoyer les clients."]);
  });

  test("only reading the notebook brings the note back into the context", () => {
    const read = at(MEMORY_LESSON, "read");

    expect(eventNames(read)).toEqual(["user.message", "session.status_running", "agent.tool_use", "agent.tool_result"]);
    expect(pileText(read)).toContain("Tutoyer les clients.");
    expect(read.run.isUsingMemory).toBe(true);
  });
});

describe("delegation", () => {
  test("each copy gets its own thread, and the copies leave once they have reported", () => {
    const spawned = at(DELEGATION_LESSON, "spawn");
    const reported = at(DELEGATION_LESSON, "report");

    expect(spawned.run.helpers.map((helper) => helper.id)).toEqual([1, 2]);
    expect(eventNames(spawned).filter((name) => name === "session.thread_created")).toHaveLength(2);
    expect(reported.run.helpers).toEqual([]);
  });

  test("each copy is given its task by a message, pauses for its tool, then reports by a message", () => {
    expect(eventNames(atEnd(DELEGATION_LESSON))).toEqual([
      "user.message",
      "session.status_running",
      "session.thread_created",
      "agent.thread_message_sent",
      "session.thread_created",
      "agent.thread_message_sent",
      "agent.custom_tool_use",
      "agent.custom_tool_use",
      "session.thread_status_idle",
      "session.thread_status_idle",
      "session.status_idle",
      "user.custom_tool_result",
      "user.custom_tool_result",
      "session.status_running",
      "agent.thread_message_received",
      "session.thread_status_idle",
      "agent.thread_message_received",
      "session.thread_status_idle",
      "agent.message",
      "session.status_idle",
    ]);
  });

  test("a thread going idle says why: waiting for your backend first, finished at the end", () => {
    const idles = atEnd(DELEGATION_LESSON).run.events.filter((line) => line.name === "session.thread_status_idle");

    expect(idles.slice(0, 2).every((line) => line.detail.includes("requires_action"))).toBe(true);
    expect(idles.slice(2).every((line) => line.detail.includes("end_turn"))).toBe(true);
  });

  test("the custom tool calls of the copies still arrive in your backend", () => {
    const calls = at(DELEGATION_LESSON, "calls");

    expect(calls.run.hop).toMatchObject({ from: "agent", to: "app" });
    expect(calls.run.helpers.map((helper) => helper.carrying)).toEqual(["reply_ticket", "reply_ticket"]);
  });

  test("the work of a copy stays in its own context: only its report joins the main one", () => {
    const end = atEnd(DELEGATION_LESSON);

    expect(pileKinds(end)).toEqual(["system", "tools", "user", "tool_result", "tool_result", "assistant"]);
    expect(pileText(end)).not.toContain("reply_ticket({");
  });
});

describe("outcome", () => {
  test("the grader asks for a revision first, then is satisfied", () => {
    const verdicts = atEnd(OUTCOME_LESSON)
      .run.events.filter((line) => line.name === "span.outcome_evaluation_end")
      .map((line) => line.detail.split(" : ")[0]);

    expect(verdicts).toEqual(["needs_revision", "satisfied"]);
  });

  test("the agent goes back to work between the two evaluations", () => {
    expect(eventNames(atEnd(OUTCOME_LESSON))).toEqual([
      "user.define_outcome",
      "session.status_running",
      "agent.tool_use",
      "agent.tool_result",
      "span.outcome_evaluation_start",
      "span.outcome_evaluation_end",
      "agent.tool_use",
      "agent.tool_result",
      "span.outcome_evaluation_start",
      "span.outcome_evaluation_end",
      "session.status_idle",
    ]);
  });

  test("the grader card follows the rubric: one criterion missing, then all met", () => {
    const revision = at(OUTCOME_LESSON, "revision").run.outcome;
    const end = atEnd(OUTCOME_LESSON).run.outcome;

    expect(revision?.phase).toBe("needs_revision");
    expect(revision?.criteria.filter((criterion) => !criterion.isMet)).toHaveLength(1);
    expect(end?.phase).toBe("satisfied");
    expect(end?.iteration).toBe(1);
    expect(end?.criteria.every((criterion) => criterion.isMet)).toBe(true);
  });
});

describe("faults", () => {
  test("a transient fault is an error event followed by a reschedule, then the same session resumes", () => {
    const failed = at(FAULTS_LESSON, "transient");
    const retried = at(FAULTS_LESSON, "retry");

    expect(eventNames(failed).slice(-2)).toEqual(["session.error", "session.status_rescheduled"]);
    expect(failed.run.events.at(-2)?.isError).toBe(true);
    expect(failed.run.status).toBe("rescheduling");
    expect(eventNames(retried)[eventNames(failed).length]).toBe("session.status_running");
    expect(retried.run.context.blocks.slice(0, failed.run.context.blocks.length)).toEqual(failed.run.context.blocks);
  });

  test("exhausted retries lose the turn but not the session: it goes idle and takes the request again", () => {
    const exhausted = at(FAULTS_LESSON, "exhausted");
    const [error, idle] = exhausted.run.events.slice(-2);

    expect(error).toMatchObject({ name: "session.error", isError: true });
    expect(error.detail).toContain("exhausted");
    expect(idle.name).toBe("session.status_idle");
    expect(idle.detail).toContain("retries_exhausted");
    expect(exhausted.run.status).toBe("idle");
    expect(pileKinds(at(FAULTS_LESSON, "fatal")).filter((kind) => kind === "user")).toHaveLength(3);
  });

  test("a final fault is an error event followed by a terminated session", () => {
    const dead = at(FAULTS_LESSON, "fatal");

    expect(eventNames(dead).slice(-2)).toEqual(["session.error", "session.status_terminated"]);
    expect(dead.run.status).toBe("terminated");
  });

  test("after a terminated session, a new one starts from an empty context", () => {
    const next = atEnd(FAULTS_LESSON);

    expect(pileKinds(next)).toEqual(["system", "tools"]);
    expect(next.run.events).toEqual([]);
    expect(next.run.status).toBe("idle");
  });
});

describe("versions", () => {
  test("a session already open keeps version 1 after the agent is updated", () => {
    const opened = at(VERSIONS_LESSON, "versioned");
    const stillFirst = at(VERSIONS_LESSON, "still-first");

    expect(stillFirst.facts.agentVersion).toBe(1);
    expect(stillFirst.run.context.blocks[0]).toEqual(opened.run.context.blocks[0]);
    expect(stillFirst.run.actor.bubble).toContain("votre");
  });

  test("a new session takes version 2 and its new instructions", () => {
    const latest = at(VERSIONS_LESSON, "latest");

    expect(latest.facts.agentVersion).toBe(2);
    expect(latest.run.context.blocks[0]?.text).toContain("tutoies");
    expect(latest.run.actor.bubble).toContain("ta demande");
  });
});

describe("web", () => {
  test("the allowed call returns the page, the other one is refused with url_not_allowed", () => {
    const results = atEnd(WEB_LESSON).run.events.filter((line) => line.name === "agent.tool_result");

    expect(results.map((line) => line.isError)).toEqual([false, true]);
    expect(results[1]?.detail).toContain("url_not_allowed");
  });

  test("web calls leave toward the web, never toward your backend", () => {
    const toolSteps = ["fetch", "page", "refused"].map((stepId) => at(WEB_LESSON, stepId).run.hop);

    for (const hop of toolSteps) {
      expect([hop?.from, hop?.to]).toContain("web");
      expect([hop?.from, hop?.to]).not.toContain("app");
    }
  });

  test("a refused call does not stop the session: the agent still answers", () => {
    expect(eventNames(atEnd(WEB_LESSON)).slice(-3)).toEqual(["agent.tool_result", "agent.message", "session.status_idle"]);
  });
});

describe("skill", () => {
  test("only the skill's description is in the context when the session opens", () => {
    const opened = at(SKILL_LESSON, "library");

    expect(pileText(opened)).toContain("La procédure à suivre avant de rembourser un client.");
    expect(pileText(opened)).not.toContain("30 jours");
  });

  test("the agent reads SKILL.md at the library when the task needs it", () => {
    const reading = at(SKILL_LESSON, "read");

    expect([...reading.pieces]).toContain("library");
    expect(reading.run.actor.position).toEqual(LIBRARY_STAND);
    expect(reading.run.activeSpot).toBe("library");
    expect(eventNames(reading).at(-1)).toBe("agent.tool_use");
  });

  test("the procedure only enters the context with the tool result", () => {
    const reading = at(SKILL_LESSON, "read");
    const loaded = at(SKILL_LESSON, "loaded");

    expect(pileText(reading)).not.toContain("30 jours");
    expect(pileText(loaded)).toContain("30 jours");
  });
});

describe("compaction", () => {
  const at = (id: string) => lessonView(COMPACTION_LESSON, COMPACTION_LESSON.steps.findIndex((step) => step.id === id));
  const threshold = (id: string) => at(id).run.context.limit * COMPACT_AT_SHARE;

  test("the pile grows with every exchange and is never compacted before the threshold", () => {
    const first = at("heavy");
    const near = at("near");

    expect(usedTokens(near.run.context)).toBeGreaterThan(usedTokens(first.run.context));
    expect(usedTokens(near.run.context)).toBeLessThanOrEqual(threshold("near"));
    expect(usedTokens(near.run.context)).toBeGreaterThan(threshold("near") / 2);
    expect(near.run.context.compactionCount).toBe(0);
  });

  test("a tool result weighs far more than the request that asked for it", () => {
    const blocks = at("heavy").run.context.blocks;
    const call = blocks.find((block) => block.kind === "tool_use");
    const result = blocks.find((block) => block.kind === "tool_result");

    expect(result?.tokens ?? 0).toBeGreaterThan((call?.tokens ?? 0) * 4);
  });

  test("crossing the threshold makes the platform summarise the oldest exchanges, once", () => {
    const before = at("near").run.context;
    const after = at("compacted").run.context;

    expect(after.compactionCount).toBe(1);
    expect(after.blocks.map((block) => block.kind).slice(0, 3)).toEqual(["system", "tools", "summary"]);
    expect(usedTokens(after)).toBeLessThan(usedTokens(before));
  });

  test("the compaction shows in the stream as an event your backend only has to read", () => {
    const names = at("compacted").run.events.map((line) => line.name);

    expect(names.filter((name) => name === "agent.thread_context_compacted")).toHaveLength(1);
    expect(at("near").run.events.some((line) => line.name === "agent.thread_context_compacted")).toBe(false);
    expect(names.at(-1)).toBe("session.status_idle");
  });

  test("keeps the agent's configuration and the latest exchange, and drops the detail of the first ticket", () => {
    const pile = at("compacted").run.context.blocks;
    const texts = pile.map((block) => block.text).join("\n");

    expect(pile.slice(0, 2).map((block) => block.kind)).toEqual(["system", "tools"]);
    expect(texts).toContain("Emma");
    expect(texts).not.toContain("Alice");
  });
});
