import { describe, expect, test } from "vitest";
import type { World } from "@/lib/world/types";
import { addTenant, applyPaint, createWorld, findTenant, patchTenant } from "@/lib/world/world";
import { toAgentTools } from "./definitions";
import { evaluateToolCall, resolveApproval } from "./execute";

const NOW = 1_000;

function twoAgents(): World {
  const first = addTenant(createWorld(), { visitorId: "v1", name: "Ada", mission: "a" });
  return addTenant(first.world, { visitorId: "v2", name: "Bob", mission: "b" }).world;
}

function call(world: World, slot: number, name: string, input: unknown, toolUseId = "sevt_1") {
  return evaluateToolCall(world, { slot, toolUseId, name, input }, NOW);
}

describe("toAgentTools", () => {
  test("exposes each tool as a custom tool with a plain JSON schema", () => {
    const tools = toAgentTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "paint_pixels",
      "paint_rect",
      "look_at_canvas",
      "post_chat_message",
    ]);
    for (const tool of tools) {
      expect(tool.type).toBe("custom");
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema).not.toHaveProperty("$schema");
    }
  });
});

describe("painting on free cells", () => {
  test("paint_rect paints immediately and reports the pixel count", () => {
    const outcome = call(twoAgents(), 0, "paint_rect", {
      x: 0,
      y: 0,
      width: 3,
      height: 2,
      color: "red",
    });

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") return;
    expect(outcome.isError).toBe(false);
    expect(outcome.text).toContain("6");
    expect(outcome.world.canvas.colors.startsWith("RRR")).toBe(true);
  });

  test("paint_pixels paints the listed cells", () => {
    const outcome = call(twoAgents(), 1, "paint_pixels", {
      pixels: [{ x: 5, y: 5, color: "blue" }],
    });

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") return;
    expect(outcome.world.canvas.owners[5 * 64 + 5]).toBe(1);
  });
});

describe("painting over another active agent", () => {
  function contested(): World {
    return applyPaint(twoAgents(), 1, [{ x: 0, y: 0, code: "B" }]);
  }

  test("is held for approval instead of being applied", () => {
    const outcome = call(contested(), 0, "paint_rect", {
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      color: "red",
    });

    expect(outcome.kind).toBe("needs_approval");
    expect(outcome.world.canvas.colors[0]).toBe("B");
    expect(outcome.world.approvals[0]).toMatchObject({
      id: "sevt_1",
      slot: 0,
      conflicts: [{ slot: 1, count: 1 }],
    });
    expect(findTenant(outcome.world, 0)?.status).toBe("awaiting_approval");
  });

  test("allow applies the paint and answers the agent with success", () => {
    const held = call(contested(), 0, "paint_rect", { x: 0, y: 0, width: 2, height: 2, color: "red" });

    const resolved = resolveApproval(held.world, "sevt_1", "allow", NOW);

    expect(resolved?.isError).toBe(false);
    expect(resolved?.slot).toBe(0);
    expect(resolved?.world.canvas.colors[0]).toBe("R");
    expect(resolved?.world.approvals).toEqual([]);
  });

  test.each(["deny", "timeout"] as const)("%s leaves the canvas untouched and reports an error", (decision) => {
    const held = call(contested(), 0, "paint_rect", { x: 0, y: 0, width: 2, height: 2, color: "red" });

    const resolved = resolveApproval(held.world, "sevt_1", decision, NOW);

    expect(resolved?.isError).toBe(true);
    expect(resolved?.text).toContain("Bob");
    expect(resolved?.world.canvas.colors[0]).toBe("B");
  });

  test("resolving an unknown approval returns null", () => {
    expect(resolveApproval(twoAgents(), "missing", "allow", NOW)).toBeNull();
  });

  test("painting over a retired agent needs no approval", () => {
    const retired = patchTenant(contested(), 1, { status: "retired", retireReason: "left" });

    const outcome = call(retired, 0, "paint_pixels", { pixels: [{ x: 0, y: 0, color: "red" }] });

    expect(outcome.kind).toBe("done");
  });
});

describe("other tools", () => {
  test("look_at_canvas returns the region, a legend and who painted there", () => {
    const world = applyPaint(twoAgents(), 1, [{ x: 1, y: 0, code: "B" }]);

    const outcome = call(world, 0, "look_at_canvas", { x: 0, y: 0, width: 3, height: 1 });

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") return;
    expect(outcome.text).toContain(".B.");
    expect(outcome.text).toContain("B=blue");
    expect(outcome.text).toContain("Bob");
  });

  test("post_chat_message publishes to the shared chat", () => {
    const outcome = call(twoAgents(), 0, "post_chat_message", { text: "bonjour" });

    expect(outcome.world.chat.at(-1)).toMatchObject({ slot: 0, name: "Ada", text: "bonjour" });
  });
});

describe("invalid calls", () => {
  test("rejects input that fails validation without changing the world", () => {
    const world = twoAgents();

    const outcome = call(world, 0, "paint_rect", { x: -1, y: 0, width: 2, height: 2, color: "mauve" });

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") return;
    expect(outcome.isError).toBe(true);
    expect(outcome.world.canvas).toBe(world.canvas);
  });

  test("rejects unknown tools", () => {
    const outcome = call(twoAgents(), 0, "delete_everything", {});

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") return;
    expect(outcome.isError).toBe(true);
  });

  test("rejects calls from an agent that is not active", () => {
    const outcome = call(twoAgents(), 9, "post_chat_message", { text: "fantôme" });

    expect(outcome.kind).toBe("done");
    if (outcome.kind !== "done") return;
    expect(outcome.isError).toBe(true);
  });
});
