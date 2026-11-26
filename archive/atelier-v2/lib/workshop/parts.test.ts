import { describe, expect, test } from "vitest";
import { cameraFor } from "./camera";
import { SCENE_VIEW } from "./layout";
import { partById, partFrame, PARTS } from "./parts";

describe("PARTS", () => {
  test("every part has its own id and something to say", () => {
    const ids = PARTS.map((part) => part.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const part of PARTS) {
      expect(part.what.length).toBeGreaterThan(20);
      expect(part.who.length).toBeGreaterThan(10);
      expect(part.code.length).toBeGreaterThan(0);
    }
  });

  test("the overview shows the whole scene, untouched", () => {
    expect(partFrame("overview")).toEqual(SCENE_VIEW);
    expect(cameraFor(partFrame("overview"), SCENE_VIEW).scale).toBe(1);
  });

  test("an object of the room is a real close-up that stays inside the scene", () => {
    const objects = PARTS.filter((each) => each.box !== null);

    expect(objects.map((part) => part.id)).toEqual(["agent", "context", "vault"]);
    for (const part of objects) {
      const frame = partFrame(part.id);

      expect(cameraFor(frame, SCENE_VIEW).scale, part.id).toBeGreaterThan(1.2);
      expect(frame.x, part.id).toBeGreaterThanOrEqual(SCENE_VIEW.x);
      expect(frame.y, part.id).toBeGreaterThanOrEqual(SCENE_VIEW.y);
      expect(frame.x + frame.width, part.id).toBeLessThanOrEqual(SCENE_VIEW.x + SCENE_VIEW.width);
      expect(frame.y + frame.height, part.id).toBeLessThanOrEqual(SCENE_VIEW.y + SCENE_VIEW.height);
    }
  });

  test("what lives in the side panels has a card but no close-up: the camera stays on the room", () => {
    for (const id of ["session", "app", "entries", "tools", "orders", "desk", "services"] as const) {
      expect(partFrame(id), id).toEqual(SCENE_VIEW);
    }
  });

  test("an unknown part is an error, not a silent overview", () => {
    expect(() => partById("nowhere" as never)).toThrow();
  });
});
