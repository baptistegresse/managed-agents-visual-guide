import { describe, expect, test } from "vitest";
import { event } from "@/lib/workshop/effects";
import { AGENT_DESK, AGENT_HOME } from "@/lib/workshop/layout";
import { lessonView, stepCount } from "./play";
import { hop, type Lesson } from "./types";

const FILE = { name: "backend.ts", blocks: [{ id: "all", lines: ["// code"] }] };
const CODE = { file: "backend.ts", blocks: ["all"] };

const LESSON: Lesson = {
  id: "demo",
  title: "Démo",
  summary: "Une leçon de test.",
  files: [FILE],
  steps: [
    { id: "one", title: "Un", text: ["a"], code: CODE, adds: ["agent"] },
    {
      id: "two",
      title: "Deux",
      text: ["b"],
      code: CODE,
      adds: ["room"],
      sets: { vaultKeys: ["paiements"] },
      actions: [
        hop("app", "agent", "user.message", "entry"),
        event("user.message", "Bonjour", "app"),
        { type: "move", to: AGENT_DESK, durationMs: 500 },
      ],
    },
    { id: "three", title: "Trois", text: ["c"], code: CODE, sets: { networking: "unrestricted" } },
  ],
};

describe("lessonView", () => {
  test("the first step shows only what it adds, with nothing running", () => {
    const view = lessonView(LESSON, 0);

    expect([...view.pieces]).toEqual(["agent"]);
    expect(view.run.events).toEqual([]);
    expect(view.run.actor.position).toEqual(AGENT_HOME);
    expect(view.facts).toEqual({ vaultKeys: [], networking: "limited", hasMountedFile: false, agentVersion: 1 });
  });

  test("each step keeps what the previous ones put in place", () => {
    const view = lessonView(LESSON, 1);

    expect([...view.pieces]).toEqual(["agent", "room"]);
    expect(view.run.events.map((line) => line.name)).toEqual(["user.message"]);
    expect(view.run.actor.position).toEqual(AGENT_DESK);
    expect(view.facts.vaultKeys).toEqual(["paiements"]);
  });

  test("a call in flight only lasts for its own step", () => {
    expect(lessonView(LESSON, 1).run.hop).not.toBeNull();
    expect(lessonView(LESSON, 2).run.hop).toBeNull();
  });

  test("a fact set by a step stays true afterwards, next to the newer ones", () => {
    expect(lessonView(LESSON, 2).facts).toEqual({
      vaultKeys: ["paiements"],
      networking: "unrestricted",
      hasMountedFile: false,
      agentVersion: 1,
    });
  });

  test("going back gives exactly the earlier view: nothing is remembered from further on", () => {
    const forward = lessonView(LESSON, 2);

    expect(lessonView(LESSON, 0)).toEqual(lessonView(LESSON, 0));
    expect(lessonView(LESSON, 0).run.events).toEqual([]);
    expect(forward.run.events).toHaveLength(1);
  });

  test("a chapter can start from a scene the previous chapters already built", () => {
    const sequel: Lesson = {
      ...LESSON,
      before: {
        adds: ["bed"],
        sets: { agentVersion: 2 },
        actions: [{ type: "move", to: AGENT_DESK, durationMs: 0 }],
      },
    };

    const view = lessonView(sequel, 0);

    expect([...view.pieces]).toEqual(["bed", "agent"]);
    expect(view.facts.agentVersion).toBe(2);
    expect(view.run.actor.position).toEqual(AGENT_DESK);
    expect(view.run.events).toEqual([]);
  });

  test("an index out of range is clamped to the lesson", () => {
    expect(lessonView(LESSON, -4)).toEqual(lessonView(LESSON, 0));
    expect(lessonView(LESSON, 99)).toEqual(lessonView(LESSON, stepCount(LESSON) - 1));
  });
});
