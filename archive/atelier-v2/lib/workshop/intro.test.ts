import { describe, expect, test } from "vitest";
import { chapterAt, INTRO, LAYER_OF_PART, visibleLayers, type Layer } from "./intro";
import { PARTS } from "./parts";

describe("the introduction", () => {
  test("starts with the model alone: nothing else is on the scene", () => {
    expect([...visibleLayers(0)]).toEqual(["agent"]);
  });

  test("adds pieces one chapter at a time and never takes one away", () => {
    INTRO.forEach((_, index) => {
      if (index === 0) return;
      const before = visibleLayers(index - 1);
      const after = visibleLayers(index);

      expect([...before].every((layer) => after.has(layer))).toBe(true);
      expect(after.size - before.size).toBeLessThanOrEqual(1);
    });
  });

  test("ends with every piece in place", () => {
    expect([...visibleLayers(INTRO.length - 1)].sort()).toEqual(["agent", "app", "context", "desk", "entries", "room"]);
  });

  test("only links pieces that are already on the scene", () => {
    const needs = { agent: "agent", app: "app", desk: "desk", webhook: "entries" } as const;

    INTRO.forEach((chapter, index) => {
      const visible = visibleLayers(index);
      for (const link of chapter.links) {
        for (const place of [link.from, link.to]) {
          expect(visible.has(needs[place as keyof typeof needs]), `${chapter.id}: ${place}`).toBe(true);
        }
      }
    });
  });

  test("every chapter points the camera at a part that exists, and has something to read", () => {
    const parts = new Set(PARTS.map((part) => part.id));

    for (const chapter of INTRO) {
      expect(parts.has(chapter.focus)).toBe(true);
      expect(chapter.lines.length).toBeGreaterThan(0);
    }
  });

  test("every chapter asks for a click on something that is already on the scene", () => {
    INTRO.forEach((chapter, index) => {
      const layer = LAYER_OF_PART[chapter.target];

      expect(layer, chapter.id).toBeDefined();
      expect(visibleLayers(index).has(layer as Layer), chapter.id).toBe(true);
      expect(chapter.prompt.length).toBeGreaterThan(5);
    });
  });

  test("the last click lands on the session, which is the first piece to build", () => {
    expect(INTRO.at(-1)?.target).toBe("session");
  });

  test("an index out of range lands on the first or the last chapter", () => {
    expect(chapterAt(-3)).toBe(INTRO[0]);
    expect(chapterAt(99)).toBe(INTRO.at(-1));
  });
});
