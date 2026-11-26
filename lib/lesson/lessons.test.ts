import { describe, expect, test } from "vitest";
import { usedTokens } from "@/lib/workshop/context";
import { AGENT_DESK, AGENT_HOME, WORKBENCH_STAND } from "@/lib/workshop/layout";
import { SESSION_LESSON } from "./base/session";
import { TOOLS_LESSON } from "./base/tools";
import { VAULT_LESSON } from "./base/vault";
import { WHAT_LESSON } from "./base/what";
import { BASE_LESSONS, EXTRA_LESSONS, isBaseLesson, lessonById, LESSONS, nextBaseLesson } from "./index";
import { lessonView, stepCount } from "./play";
import type { Lesson } from "./types";

const atEnd = (lesson: Lesson) => lessonView(lesson, stepCount(lesson) - 1);
const atStep = (lesson: Lesson, id: string) => lessonView(lesson, lesson.steps.findIndex((step) => step.id === id));
const eventNames = (lesson: Lesson): string[] => atEnd(lesson).run.events.map((line) => line.name);
const named = (lessons: readonly Lesson[]) => lessons.map((lesson) => [lesson.id, lesson] as const);

describe("every lesson", () => {
  test.each(named(LESSONS))("%s is well formed", (_id, lesson) => {
    const stepIds = lesson.steps.map((step) => step.id);

    expect(lesson.title.length).toBeGreaterThan(3);
    expect(lesson.summary.length).toBeGreaterThan(10);
    expect(lesson.steps.length).toBeGreaterThanOrEqual(3);
    expect(new Set(stepIds).size).toBe(stepIds.length);
    for (const step of lesson.steps) {
      expect(step.text.length, step.id).toBeGreaterThanOrEqual(1);
      expect(step.text.length, step.id).toBeLessThanOrEqual(3);
    }
  });

  test.each(named(LESSONS))("%s only lights code that exists", (_id, lesson) => {
    for (const step of lesson.steps) {
      const file = lesson.files.find((each) => each.name === step.code.file);

      expect(file, `${step.id}: ${step.code.file}`).toBeDefined();
      expect(step.code.blocks.length, step.id).toBeGreaterThan(0);
      for (const block of step.code.blocks) {
        expect(file?.blocks.some((each) => each.id === block), `${step.id}: ${block}`).toBe(true);
      }
    }
  });

  test.each(named(LESSONS))("%s ends with nothing left hanging", (_id, lesson) => {
    const { run } = atEnd(lesson);

    expect(run.hop).toBeNull();
    expect(run.approval).toBeNull();
    expect(run.actor.bubble).toBeNull();
  });

  test.each(named(EXTRA_LESSONS))("the annex %s leaves the agent back in bed", (_id, lesson) => {
    expect(atEnd(lesson).run.actor.position).toEqual(AGENT_HOME);
  });

  test("ids are unique, and an unknown id falls back to the very first chapter", () => {
    const ids = LESSONS.map((lesson) => lesson.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(lessonById("nope")).toBe(WHAT_LESSON);
  });
});

describe("the basics", () => {
  test("start with what an agent is, then take its bricks one by one", () => {
    expect(BASE_LESSONS.map((lesson) => lesson.id)).toEqual(["what", "environment", "tools", "session", "vault"]);
  });

  test("chain: each chapter starts from pieces the previous one left on the scene", () => {
    BASE_LESSONS.forEach((lesson, position) => {
      if (position === 0) return;
      const left = atEnd(BASE_LESSONS[position - 1]).pieces;

      for (const piece of lesson.before?.adds ?? []) {
        expect(left.has(piece), `${lesson.id} starts with ${piece}`).toBe(true);
      }
    });
  });

  test("lead from one chapter to the next, and to nothing after the last", () => {
    expect(nextBaseLesson("what")?.id).toBe("environment");
    expect(nextBaseLesson("vault")).toBeNull();
    expect(nextBaseLesson("webhook")).toBeNull();
    expect(isBaseLesson("tools")).toBe(true);
    expect(isBaseLesson("webhook")).toBe(false);
  });
});

describe("“un agent, c'est quoi ?”", () => {
  test("opens on the model alone, and only shows the hosted room when Managed Agents is introduced", () => {
    expect([...lessonView(WHAT_LESSON, 0).pieces]).toEqual(["agent"]);
    expect(atStep(WHAT_LESSON, "burden").pieces.has("room")).toBe(false);
    expect(atStep(WHAT_LESSON, "managed").pieces.has("room")).toBe(true);
  });

  test("explains the loop without any session: no event, no context", () => {
    const { run } = atEnd(WHAT_LESSON);

    expect(run.events).toEqual([]);
    expect(run.context.blocks).toEqual([]);
    expect(run.actor.position).toEqual(AGENT_DESK);
  });
});

describe("the environment", () => {
  const environment = BASE_LESSONS[1];

  test("shows the network closed, then open, then closed again", () => {
    expect(atStep(environment, "isolated").facts.networking).toBe("limited");
    expect(atStep(environment, "open").facts.networking).toBe("unrestricted");
    expect(atEnd(environment).facts.networking).toBe("limited");
  });

  test("shows the container as the workbench from the very first step: the room itself is the platform", () => {
    expect(atStep(environment, "why").pieces.has("bench")).toBe(true);
    expect(environment.steps[0].text.join(" ")).toContain("établi");
  });

  test("sends the agent to its workbench when it says what runs inside the container", () => {
    expect(atStep(environment, "inside").run.actor.position).toEqual(WORKBENCH_STAND);
    expect(atEnd(environment).run.actor.position).toEqual(AGENT_DESK);
  });
});

describe("the tools", () => {
  test("show the three families: your backend, the container, a third-party service", () => {
    expect(atStep(TOOLS_LESSON, "custom").run.hop).toMatchObject({ from: "app", to: "agent" });
    expect(atStep(TOOLS_LESSON, "builtin").run.terminal).not.toBeNull();
    expect(atStep(TOOLS_LESSON, "mcp").run.hop).toMatchObject({ from: "agent", to: "service:paiements" });
  });

  test("end with the agent asleep: a configuration does nothing until a session runs", () => {
    const { run, pieces } = atEnd(TOOLS_LESSON);

    expect(pieces.has("bed")).toBe(true);
    expect(run.actor).toMatchObject({ position: AGENT_HOME, mood: "idle" });
    expect(run.events).toEqual([]);
  });
});

describe("the session", () => {
  const last = atEnd(SESSION_LESSON);

  test("mirrors the real order of events of a turn with one custom tool", () => {
    expect(eventNames(SESSION_LESSON)).toEqual([
      "user.message",
      "session.status_running",
      "agent.custom_tool_use",
      "session.status_idle",
      "user.custom_tool_result",
      "session.status_running",
      "agent.message",
      "session.status_idle",
    ]);
  });

  test("opens the context with the agent's configuration, then stacks the exchange on it", () => {
    const opened = atStep(SESSION_LESSON, "session");

    expect(atStep(SESSION_LESSON, "request").run.context.blocks).toEqual([]);
    expect(opened.run.context.blocks.map((block) => block.kind)).toEqual(["system", "tools"]);
    expect(last.run.context.blocks.map((block) => block.kind)).toEqual([
      "system",
      "tools",
      "user",
      "tool_use",
      "tool_result",
      "assistant",
    ]);
    expect(usedTokens(last.run.context)).toBeGreaterThan(usedTokens(opened.run.context));
  });

  test("the model re-reads its context twice: after the message, and after the tool result", () => {
    expect(last.run.context.requestCount).toBe(2);
  });

  test("never lets the agent leave its room: calls go out, the agent stays", () => {
    const places = SESSION_LESSON.steps.flatMap((step) =>
      (step.actions ?? []).flatMap((action) => (action.type === "hop" && action.hop ? [action.hop.from, action.hop.to] : [])),
    );

    expect(new Set(places)).toEqual(new Set(["app", "agent", "desk"]));
    expect(last.run.actor.position).toEqual(AGENT_HOME);
  });
});

describe("the vault", () => {
  test("holds no key until one is stored, then keeps it", () => {
    expect(atStep(VAULT_LESSON, "vault").facts.vaultKeys).toEqual([]);
    expect(atStep(VAULT_LESSON, "credential").facts.vaultKeys).toEqual(["paiements"]);
    expect(atEnd(VAULT_LESSON).facts.vaultKeys).toEqual(["paiements"]);
  });

  test("sends the call through the vault to the service, never through your backend", () => {
    const places = VAULT_LESSON.steps.flatMap((step) =>
      (step.actions ?? []).flatMap((action) => (action.type === "hop" && action.hop ? [action.hop.from, action.hop.to] : [])),
    );

    expect(places).toEqual(["agent", "vault", "vault", "service:paiements", "service:paiements", "agent"]);
  });

  test("mirrors the real order of events of a third-party tool call", () => {
    expect(eventNames(VAULT_LESSON)).toEqual([
      "user.message",
      "session.status_running",
      "agent.mcp_tool_use",
      "agent.mcp_tool_result",
      "agent.message",
      "session.status_idle",
    ]);
  });

  test("never lets the key into the agent's context", () => {
    const pile = atEnd(VAULT_LESSON)
      .run.context.blocks.map((block) => block.text)
      .join("\n");

    expect(pile).toContain("create_refund");
    expect(pile).not.toMatch(/PAIEMENTS_API_KEY|token|clé/i);
  });
});
