import { describe, expect, test } from "vitest";
import { hopAnchors, sideOf } from "./anchors";
import { AGENT_DESK, SCENE_VIEW } from "./layout";

const MIDDLE = SCENE_VIEW.x + SCENE_VIEW.width / 2;

describe("sideOf", () => {
  test.each([
    ["agent", "room"],
    ["vault", "room"],
    ["cron", "room"],
    ["app", "app"],
    ["webhook", "app"],
    ["orders", "app"],
    ["desk", "world"],
    ["service:paiements", "world"],
    ["web", "world"],
  ] as const)("%s is on the %s side", (place, side) => {
    expect(sideOf(place)).toBe(side);
  });
});

describe("hopAnchors", () => {
  test("a call to your application leaves the room through its left edge", () => {
    const anchors = hopAnchors({ from: "agent", to: "app" }, AGENT_DESK);

    expect(anchors?.to.x).toBeLessThan(MIDDLE);
    expect(anchors?.to.x).toBeGreaterThanOrEqual(SCENE_VIEW.x);
    expect(anchors?.from.x).toBeGreaterThan(anchors?.to.x ?? 0);
  });

  test("a call to a third-party service leaves through the right edge, and its result comes back the same way", () => {
    const out = hopAnchors({ from: "vault", to: "service:paiements" }, AGENT_DESK);
    const back = hopAnchors({ from: "service:paiements", to: "agent" }, AGENT_DESK);

    expect(out?.to.x).toBeGreaterThan(MIDDLE);
    expect(back?.from).toEqual(out?.to);
  });

  test("a call that stays inside the room goes straight from one object to the other", () => {
    const anchors = hopAnchors({ from: "agent", to: "vault" }, AGENT_DESK);

    expect(anchors?.from).not.toEqual(anchors?.to);
    expect(anchors?.to.x).toBeGreaterThan(SCENE_VIEW.x + 30);
  });

  test("what your application does to the support desk passes under the room, never through it", () => {
    const direct = hopAnchors({ from: "agent", to: "app" }, AGENT_DESK);
    const outside = hopAnchors({ from: "app", to: "desk" }, AGENT_DESK);

    expect(outside?.from.x).toBeLessThan(MIDDLE);
    expect(outside?.to.x).toBeGreaterThan(MIDDLE);
    expect(outside?.from.y).toBe(outside?.to.y);
    expect(outside?.from.y).toBeGreaterThan(direct?.to.y ?? 0);
  });

  test("when the camera is zoomed, calls leave through the edges of what is on screen", () => {
    const frame = { x: -100, y: -20, width: 200, height: 150 };

    const out = hopAnchors({ from: "agent", to: "app" }, AGENT_DESK, frame);
    const right = hopAnchors({ from: "agent", to: "desk" }, AGENT_DESK, frame);

    expect(out?.to.x).toBeGreaterThanOrEqual(frame.x);
    expect(out?.to.x).toBeLessThan(frame.x + 20);
    expect(right?.to.x).toBeGreaterThan(frame.x + frame.width - 20);
    expect(right?.to.y).toBeGreaterThan(frame.y);
    expect(right?.to.y).toBeLessThan(frame.y + frame.height);
  });

  test("something that happens entirely on one outer side has no path to draw", () => {
    expect(hopAnchors({ from: "app", to: "orders" }, AGENT_DESK)).toBeNull();
    expect(hopAnchors({ from: "service:paiements", to: "desk" }, AGENT_DESK)).toBeNull();
  });
});
