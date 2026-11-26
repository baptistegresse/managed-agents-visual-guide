import { describe, expect, test } from "vitest";
import { addChatMessage, addTenant, applyPaint, createWorld, findTenant, patchTenant } from "./world";
import { buildKickoffMessage, buildTurnMessage } from "./digest";

function arena() {
  const first = addTenant(createWorld(), { visitorId: "v1", name: "Ada", mission: "dessine un soleil" });
  return addTenant(first.world, { visitorId: "v2", name: "Bob", mission: "b" }).world;
}

describe("buildKickoffMessage", () => {
  test("introduces the agent, its mission and the other agents present", () => {
    const world = arena();

    const text = buildKickoffMessage(world, findTenant(world, 0)!, 12);

    expect(text).toContain("Ada");
    expect(text).toContain("dessine un soleil");
    expect(text).toContain("Bob");
    expect(text).toContain("1/12");
  });
});

describe("buildTurnMessage", () => {
  test("reports only what others did since the agent's last turn", () => {
    const before = addChatMessage(arena(), 1, "ancien message", 1);
    const caughtUp = patchTenant(before, 0, { lastChatSeq: before.nextSeq - 1, turn: 1 });
    const withNews = applyPaint(
      addChatMessage(addChatMessage(caughtUp, 1, "nouveau message", 2), 0, "mon propre message", 3),
      1,
      [{ x: 4, y: 5, code: "B" }],
    );

    const turn = buildTurnMessage(withNews, findTenant(withNews, 0)!, 12);

    expect(turn.text).toContain("nouveau message");
    expect(turn.text).not.toContain("ancien message");
    expect(turn.text).not.toContain("mon propre message");
    expect(turn.text).toContain("Bob a peint 1 pixel");
    expect(turn.text).toContain("2/12");
    expect(turn.lastChatSeq).toBeGreaterThan(caughtUp.nextSeq - 1);
    expect(turn.lastChangeSeq).toBe(withNews.changes.at(-1)?.seq);
  });

  test("says so when nothing happened", () => {
    const world = arena();

    const turn = buildTurnMessage(world, findTenant(world, 0)!, 12);

    expect(turn.text).toContain("Rien de nouveau");
  });
});
