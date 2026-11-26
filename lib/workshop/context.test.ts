import { describe, expect, test } from "vitest";
import {
  compact,
  CONTEXT_LIMIT,
  createContext,
  KEEP_RECENT_BLOCKS,
  markRequest,
  needsCompaction,
  openContext,
  recordInContext,
  usedTokens,
  type ContextWindow,
} from "./context";

const SETUP = {
  system: "Tu réponds aux clients du support.",
  toolLines: ["reply_ticket : envoie une réponse au client", "lookup_order : retrouve la commande du client"],
};

function after(lines: ReadonlyArray<{ name: string; detail?: string }>, from: ContextWindow = openContext(SETUP)): ContextWindow {
  return lines.reduce<ContextWindow>(
    (window, line) => recordInContext(window, { name: line.name, detail: line.detail ?? "" }),
    from,
  );
}

function filled(blockCount: number): ContextWindow {
  return after(
    Array.from({ length: blockCount }, (_, index) => ({
      name: index % 2 === 0 ? "agent.custom_tool_use" : "user.custom_tool_result",
      detail: `reply_ticket({"ticket":${index},"tone":"vous"}) puis un résultat assez long pour compter le coût`,
    })),
  );
}

describe("openContext", () => {
  test("a new session starts with the system prompt and the tool definitions, nothing else", () => {
    const window = openContext(SETUP);

    expect(window.blocks.map((block) => block.kind)).toEqual(["system", "tools"]);
    expect(usedTokens(window)).toBeGreaterThan(0);
    expect(window.limit).toBe(CONTEXT_LIMIT);
  });

  test("an agent without tools has no tool block", () => {
    const window = openContext({ system: "Bonjour", toolLines: [] });

    expect(window.blocks.map((block) => block.kind)).toEqual(["system"]);
  });

  test("before any session the window is empty", () => {
    expect(createContext().blocks).toEqual([]);
  });
});

describe("recordInContext", () => {
  test.each([
    ["user.message", "user"],
    ["user.define_outcome", "user"],
    ["agent.message", "assistant"],
    ["agent.custom_tool_use", "tool_use"],
    ["agent.tool_use", "tool_use"],
    ["agent.mcp_tool_use", "tool_use"],
    ["user.custom_tool_result", "tool_result"],
    ["agent.tool_result", "tool_result"],
    ["agent.mcp_tool_result", "tool_result"],
    ["agent.thread_message_received", "tool_result"],
  ])("%s enters the window as a %s block", (name, kind) => {
    const window = after([{ name, detail: "contenu" }]);

    expect(window.blocks.at(-1)).toMatchObject({ kind, label: name, text: "contenu" });
  });

  test.each([
    "session.status_idle",
    "session.thread_status_idle",
    "agent.thread_message_sent",
    "session.status_running",
    "session.error",
    "user.tool_confirmation",
    "span.model_request_end",
    "appel API → ta route",
    "agents.update",
  ])("%s is for your application, the model never reads it", (name) => {
    const before = openContext(SETUP);

    expect(recordInContext(before, { name, detail: "peu importe" })).toBe(before);
  });

  test("what a sub-agent does stays in its own thread", () => {
    const before = openContext(SETUP);

    const window = recordInContext(before, { name: "agent.custom_tool_use", detail: '[thread 1] reply_ticket({"ticket":1})' });

    expect(window).toBe(before);
  });

  test("a longer text costs more tokens, and the window is never mutated", () => {
    const before = openContext(SETUP);

    const short = recordInContext(before, { name: "user.message", detail: "Salut" });
    const long = recordInContext(before, { name: "user.message", detail: "Salut ".repeat(40) });

    expect(usedTokens(long)).toBeGreaterThan(usedTokens(short));
    expect(before.blocks).toHaveLength(2);
  });
});

describe("compaction", () => {
  test("is not needed while the window has room", () => {
    expect(needsCompaction(after([{ name: "user.message", detail: "Réponds au ticket d'Alice" }]))).toBe(false);
  });

  test("is needed once the window is nearly full", () => {
    expect(needsCompaction(filled(60))).toBe(true);
  });

  test("replaces the oldest exchanges with one summary and keeps the setup and the latest blocks", () => {
    const full = filled(60);

    const compacted = compact(full);

    expect(compacted.blocks.map((block) => block.kind).slice(0, 3)).toEqual(["system", "tools", "summary"]);
    expect(compacted.blocks).toHaveLength(3 + KEEP_RECENT_BLOCKS);
    expect(compacted.blocks.at(-1)).toEqual(full.blocks.at(-1));
    expect(usedTokens(compacted)).toBeLessThan(usedTokens(full));
    expect(compacted.compactionCount).toBe(1);
  });

  test("folds an earlier summary into the new one instead of stacking them", () => {
    const twice = compact(after(filled(30).blocks.slice(2).map((block) => ({ name: block.label, detail: block.text })), compact(filled(60))));

    expect(twice.blocks.filter((block) => block.kind === "summary")).toHaveLength(1);
    expect(twice.compactionCount).toBe(2);
  });

  test("leaves a short conversation alone", () => {
    const short = after([{ name: "user.message", detail: "Salut" }]);

    expect(compact(short)).toBe(short);
  });
});

describe("markRequest", () => {
  test("each model request re-reads the whole window", () => {
    const window = after([{ name: "user.message", detail: "Réponds au ticket d'Alice" }]);

    const requested = markRequest(markRequest(window));

    expect(requested.requestCount).toBe(2);
    expect(requested.lastRequestTokens).toBe(usedTokens(window));
  });
});
