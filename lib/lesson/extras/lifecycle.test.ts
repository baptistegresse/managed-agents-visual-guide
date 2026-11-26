import { describe, expect, test } from "vitest";
import { usedTokens } from "@/lib/workshop/context";
import { WORKBENCH_STAND } from "@/lib/workshop/layout";
import { lessonView, stepCount, type LessonView } from "../play";
import type { Lesson } from "../types";
import { INTERRUPT_LESSON } from "./interrupt";
import { RESUME_LESSON } from "./resume";
import { SECRET_LESSON } from "./secret";
import { TURNS_LESSON } from "./turns";

const FIRST_REQUEST = "Réponds au ticket d'Alice.";

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

function count(view: LessonView, name: string): number {
  return eventNames(view).filter((each) => each === name).length;
}

function pileText(view: LessonView): string {
  return view.run.context.blocks.map((block) => block.text).join("\n");
}

describe("turns", () => {
  test("opens on a session that has already served one turn", () => {
    const first = lessonView(TURNS_LESSON, 0);

    expect(pileText(first)).toContain(FIRST_REQUEST);
    expect(count(first, "user.message")).toBe(1);
    expect(eventNames(first).at(-1)).toBe("session.status_idle");
  });

  test("the second message goes to the same session: the first turn is still in the pile", () => {
    const second = at(TURNS_LESSON, "second");

    expect(count(second, "user.message")).toBe(2);
    expect(pileText(second)).toContain(FIRST_REQUEST);
    expect(second.run.context.blocks.filter((block) => block.kind === "user")).toHaveLength(2);
  });

  test("the pile only grows from one turn to the next: nothing reopens the session", () => {
    const sizes = TURNS_LESSON.steps.map((_step, index) => usedTokens(lessonView(TURNS_LESSON, index).run.context));

    expect([...sizes].sort((left, right) => left - right)).toEqual(sizes);
    expect(sizes.at(-1)).toBeGreaterThan(sizes[0]);
  });

  test("the stream ends with two complete turns", () => {
    const end = atEnd(TURNS_LESSON);

    expect(count(end, "agent.custom_tool_use")).toBe(2);
    expect(count(end, "user.custom_tool_result")).toBe(2);
    expect(count(end, "agent.message")).toBe(2);
  });
});

describe("resume", () => {
  test("the session keeps working while nobody listens: the tool call is emitted during the cut", () => {
    const cut = at(RESUME_LESSON, "cut");

    expect(cut.run.hop).toMatchObject({ from: "agent", to: "app", tone: "error" });
    expect(eventNames(cut)).toContain("agent.custom_tool_use");
    expect(eventNames(cut).at(-1)).toBe("session.status_idle");
    expect(cut.run.actor.mood).toBe("waiting");
  });

  test("the call stays unanswered until the backend has re-read the history", () => {
    expect(count(at(RESUME_LESSON, "no-replay"), "user.custom_tool_result")).toBe(0);
    expect(count(at(RESUME_LESSON, "history"), "user.custom_tool_result")).toBe(0);
    expect(at(RESUME_LESSON, "history").run.hop).toMatchObject({ from: "agent", to: "app", tone: "result" });

    const names = eventNames(at(RESUME_LESSON, "answered"));

    expect(names.indexOf("user.custom_tool_result")).toBeGreaterThan(names.indexOf("agent.custom_tool_use"));
  });

  test("the same session finishes the turn: one request, one tool call, one answer", () => {
    const end = atEnd(RESUME_LESSON);

    expect(count(end, "user.message")).toBe(1);
    expect(count(end, "agent.custom_tool_use")).toBe(1);
    expect(count(end, "agent.message")).toBe(1);
    expect(pileText(end)).toContain(FIRST_REQUEST);
  });
});

describe("interrupt", () => {
  test("the interrupt is an event your backend sends while the agent is running", () => {
    const stop = at(INTERRUPT_LESSON, "stop");
    const last = stop.run.events.at(-1);

    expect(last).toMatchObject({ name: "user.interrupt", origin: "app" });
    expect(stop.run.hop).toMatchObject({ from: "app", to: "agent" });
    expect(stop.run.status).toBe("running");
  });

  test("the turn then ends idle like any other, without an answer and without a second tool call", () => {
    const boundary = at(INTERRUPT_LESSON, "boundary");

    expect(eventNames(boundary).at(-1)).toBe("session.status_idle");
    expect(boundary.run.events.at(-1)?.detail).toContain("end_turn");
    expect(boundary.run.status).toBe("idle");
    expect(count(boundary, "agent.message")).toBe(0);
    expect(count(boundary, "agent.custom_tool_use")).toBe(1);
  });

  test("the agent never reads the interrupt: it is not in its pile", () => {
    const end = atEnd(INTERRUPT_LESSON);

    expect(end.run.context.blocks.some((block) => block.label === "user.interrupt")).toBe(false);
  });

  test("the session stays usable: a new message gets an answer from the same pile", () => {
    const end = atEnd(INTERRUPT_LESSON);

    expect(count(end, "user.message")).toBe(2);
    expect(count(end, "agent.message")).toBe(1);
    expect(end.run.context.blocks.filter((block) => block.kind === "user")).toHaveLength(2);
  });
});

describe("secret", () => {
  test("the vault is empty until the credential is created, then holds the carrier key", () => {
    expect(lessonView(SECRET_LESSON, 0).facts.vaultKeys).toEqual([]);
    expect(at(SECRET_LESSON, "credential").facts.vaultKeys).toEqual(["transporteur"]);
  });

  test("curl runs at the workbench, and names the variable instead of the key", () => {
    const curl = at(SECRET_LESSON, "curl");

    expect(curl.pieces.has("bench")).toBe(true);
    expect(curl.run.actor.position).toEqual(WORKBENCH_STAND);
    expect(curl.run.terminal?.join("\n")).toContain("$TRANSPORTEUR_API_KEY");
    expect(curl.run.activeKey).toBeNull();
  });

  test("the request leaves from the container, and the key only joins it on the way out", () => {
    const egress = at(SECRET_LESSON, "egress");

    expect(at(SECRET_LESSON, "curl").run.hop).toMatchObject({ from: "app", to: "agent" });
    expect(egress.run.activeKey).toEqual({ key: "transporteur", isDenied: false });
    expect(egress.run.hop).toMatchObject({ from: "agent", to: "service:transporteur" });
    expect(egress.run.actor.position).toEqual(WORKBENCH_STAND);
  });

  test("the call is a built-in tool: nothing goes through your backend", () => {
    const names = eventNames(atEnd(SECRET_LESSON));

    expect(names).toContain("agent.tool_use");
    expect(names).toContain("agent.tool_result");
    expect(names).not.toContain("agent.custom_tool_use");
    expect(names).not.toContain("agent.mcp_tool_use");
  });
});
