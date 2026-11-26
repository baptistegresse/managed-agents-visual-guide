import { describe, expect, test } from "vitest";
import { LIMITS } from "@/lib/config";
import {
  activeSlots,
  addChatMessage,
  addTenant,
  applyPaint,
  createWorld,
  findActiveTenantByVisitor,
  findTenant,
  logActivity,
  patchTenant,
  setPaused,
  toPublicWorld,
} from "./world";

function worldWithTenant(name = "Ada", visitorId = "visitor-1") {
  return addTenant(createWorld(), { visitorId, name, mission: "peindre" });
}

describe("addTenant", () => {
  test("assigns increasing slots and a distinct accent", () => {
    const first = worldWithTenant();
    const second = addTenant(first.world, { visitorId: "visitor-2", name: "Bob", mission: "x" });

    expect(first.tenant.slot).toBe(0);
    expect(second.tenant.slot).toBe(1);
    expect(second.tenant.accent).not.toBe(first.tenant.accent);
    expect(second.tenant.status).toBe("starting");
  });
});

describe("tenant lookups", () => {
  test("finds the active agent of a visitor and ignores retired ones", () => {
    const { world, tenant } = worldWithTenant();
    const retired = patchTenant(world, tenant.slot, { status: "retired", retireReason: "left" });

    expect(findActiveTenantByVisitor(world, "visitor-1")?.slot).toBe(0);
    expect(findActiveTenantByVisitor(retired, "visitor-1")).toBeUndefined();
    expect(activeSlots(retired).size).toBe(0);
  });

  test("patchTenant returns a new world and leaves the original untouched", () => {
    const { world, tenant } = worldWithTenant();

    const patched = patchTenant(world, tenant.slot, { turn: 3 });

    expect(findTenant(patched, 0)?.turn).toBe(3);
    expect(findTenant(world, 0)?.turn).toBe(0);
  });
});

describe("chat and activity", () => {
  test("appends a chat message with the author's name and a sequence number", () => {
    const { world } = worldWithTenant();

    const next = addChatMessage(world, 0, "salut", 1000);

    expect(next.chat).toEqual([{ seq: world.nextSeq, slot: 0, name: "Ada", text: "salut", at: 1000 }]);
  });

  test("keeps only the most recent chat messages", () => {
    let { world } = worldWithTenant();
    for (let index = 0; index < LIMITS.chatHistorySize + 5; index += 1) {
      world = addChatMessage(world, 0, `message ${index}`, index);
    }

    expect(world.chat).toHaveLength(LIMITS.chatHistorySize);
    expect(world.chat.at(-1)?.text).toBe(`message ${LIMITS.chatHistorySize + 4}`);
  });

  test("logs activity with its source", () => {
    const next = logActivity(createWorld(), { slot: null, source: "moderator", text: "pause" }, 5);

    expect(next.activity[0]).toMatchObject({ source: "moderator", text: "pause", at: 5 });
  });
});

describe("applyPaint", () => {
  test("paints the canvas and records the change with its bounding box", () => {
    const { world } = worldWithTenant();

    const next = applyPaint(world, 0, [
      { x: 2, y: 3, code: "R" },
      { x: 4, y: 3, code: "R" },
    ]);

    expect(next.canvas.owners[3 * next.canvas.size + 2]).toBe(0);
    expect(next.changes.at(-1)).toMatchObject({
      slot: 0,
      count: 2,
      box: { minX: 2, minY: 3, maxX: 4, maxY: 3 },
    });
  });
});

describe("toPublicWorld", () => {
  test("never exposes visitor identifiers and marks the viewer's own agent", () => {
    const { world } = worldWithTenant("Ada", "secret-visitor");
    const painted = applyPaint(world, 0, [{ x: 0, y: 0, code: "R" }]);

    const mine = toPublicWorld(painted, "secret-visitor");
    const theirs = toPublicWorld(painted, "someone-else");

    expect(JSON.stringify(mine)).not.toContain("secret-visitor");
    expect(mine.mySlot).toBe(0);
    expect(theirs.mySlot).toBeNull();
    expect(mine.agents[0].pixelCount).toBe(1);
  });

  test("reflects the paused flag", () => {
    expect(toPublicWorld(setPaused(createWorld(), true), null).isPaused).toBe(true);
  });
});
