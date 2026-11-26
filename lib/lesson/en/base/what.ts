import { AGENT_DESK } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../../types";

const MODEL_FILE: CodeFile = {
  name: "model.ts",
  blocks: [
    {
      id: "call",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        "",
        "const client = new Anthropic();",
        "",
        "// One call to the model: text goes in, text comes out.",
        "const response = await client.messages.create({",
        '  model: "claude-haiku-5-5",',
        "  max_tokens: 1024,",
        "  messages: [{ role: \"user\", content: \"Reply to Alice's ticket.\" }],",
        "});",
        "",
      ],
    },
    {
      id: "answer",
      lines: [
        "// response.content:",
        "//   “I don't have access to your tickets. Here is what I",
        "//     would reply to Alice if I could…”",
      ],
    },
  ],
};

const LOOP_FILE: CodeFile = {
  name: "loop.ts",
  blocks: [
    {
      id: "tools",
      lines: [
        "// We describe to the model what it is allowed to ask for.",
        "const tools = [",
        "  {",
        '    name: "reply_ticket",',
        '    description: "Sends a reply to the customer and resolves their ticket.",',
        "    input_schema: {",
        '      type: "object",',
        '      properties: { ticket: { type: "integer" } },',
        '      required: ["ticket"],',
        "    },",
        "  },",
        "];",
        "",
      ],
    },
    {
      id: "ask",
      lines: [
        "const messages = [{ role: \"user\", content: \"Reply to Alice's ticket.\" }];",
        "",
        "while (true) {",
        "  // On every turn, we send the WHOLE conversation back to the model.",
        "  const response = await client.messages.create({",
        '    model: "claude-haiku-5-5",',
        "    max_tokens: 1024,",
        "    tools,",
        "    messages,",
        "  });",
        '  messages.push({ role: "assistant", content: response.content });',
        "",
      ],
    },
    {
      id: "stop",
      lines: ["  // No tool requested: it is done.", '  if (response.stop_reason !== "tool_use") break;', ""],
    },
    {
      id: "run",
      lines: [
        "  // It asks for a tool: it is up to you to run it…",
        "  const results = [];",
        "  for (const block of response.content) {",
        '    if (block.type !== "tool_use") continue;',
        "    const output = await runTool(block.name, block.input);",
        '    results.push({ type: "tool_result", tool_use_id: block.id, content: output });',
        "  }",
        "",
      ],
    },
    {
      id: "back",
      lines: ["  // …then to hand it the result, and start again.", '  messages.push({ role: "user", content: results });', "}"],
    },
  ],
};

const MANAGED_FILE: CodeFile = {
  name: "managed.ts",
  blocks: [
    {
      id: "managed",
      lines: [
        "// With Managed Agents, the loop no longer runs on your side.",
        "// You describe the agent once…",
        "const agent = await client.beta.agents.create({ name, model, system, tools });",
        "",
        "// …then you start a session, and you write to it.",
        "const session = await client.beta.sessions.create({",
        "  agent: agent.id,",
        "  environment_id: environment.id,",
        "});",
        "await client.beta.sessions.events.send(session.id, {",
        "  events: [",
        "    { type: \"user.message\", content: [{ type: \"text\", text: \"Reply to Alice's ticket.\" }] },",
        "  ],",
        "});",
        "",
      ],
    },
    {
      id: "objects",
      lines: [
        "// The four objects to know:",
        "//   agent        what it is: a model, instructions, tools",
        "//   environment  where it works: the template for its container",
        "//   session      one run: this is where everything happens",
        "//   vault        the keys to the services it calls without you",
      ],
    },
  ],
};

/**
 * The first chapter: what an agent is (a model, tools, a loop),
 * and what Managed Agents takes care of for you.
 */
export const WHAT_LESSON: Lesson = {
  id: "what",
  title: "What is an agent?",
  summary: "A model, tools, a loop. And what Managed Agents does for you.",
  files: [MODEL_FILE, LOOP_FILE, MANAGED_FILE],
  steps: [
    {
      id: "model",
      title: "First, a model",
      text: [
        "Claude is a language model: you send it text, it sends text back.",
        "One call, one answer. Between two calls, it remembers nothing and does nothing.",
      ],
      code: { file: MODEL_FILE.name, blocks: ["call"] },
      adds: ["agent"],
      actions: [
        { type: "move", to: AGENT_DESK, durationMs: 0 },
        { type: "bubble", text: "Hello! Someone writes to me, I reply." },
      ],
    },
    {
      id: "limits",
      title: "On its own, it can't do anything",
      text: [
        "Ask it to reply to Alice's ticket: all it can do is write what it would do.",
        "It has no access to your support inbox, your database, or anything else. Producing text is all it does.",
      ],
      code: { file: MODEL_FILE.name, blocks: ["call", "answer"] },
      actions: [{ type: "bubble", text: "I can't open this ticket. I can only write." }],
    },
    {
      id: "tools",
      title: "We give it tools",
      text: [
        "A tool is an action you describe to it: a name, what it is for, what you need to give it.",
        "The model doesn't run it. Instead of answering, it writes a request: “call reply_ticket for ticket 1”.",
        "Someone else has to do the action, then tell it what happened.",
      ],
      code: { file: LOOP_FILE.name, blocks: ["tools"] },
      actions: [
        { type: "bubble", text: null },
        { type: "mood", mood: "waiting" },
        hop("agent", "app", "reply_ticket", "call"),
      ],
    },
    {
      id: "loop",
      title: "The loop",
      text: [
        "It asks for a tool, we run it, we hand back the result, and it decides what comes next. We repeat until it has nothing left to ask for.",
        "A model, tools, a loop: that is an agent.",
      ],
      code: { file: LOOP_FILE.name, blocks: ["ask", "stop", "run", "back"] },
      actions: [
        { type: "mood", mood: "thinking" },
        hop("app", "agent", "result", "result"),
      ],
    },
    {
      id: "burden",
      title: "Running this loop is real work",
      text: [
        "This code has to run somewhere, sometimes for a long time. You need to keep the whole conversation, send it back on every turn, and pick up again after a crash.",
        "And if the agent has to run a command or read a file, it needs a machine, isolated from the rest.",
      ],
      code: { file: LOOP_FILE.name, blocks: ["ask", "run"] },
      actions: [{ type: "mood", mood: "idle" }],
    },
    {
      id: "managed",
      title: "The goal of Managed Agents",
      text: [
        "Managed Agents does all of this for you, hosted by Anthropic: the loop, the memory of the conversation, the machine where the agent works.",
        "This room is exactly that: the place where your agent runs, hosted for you.",
        "Three things are left for you to do: describe the agent, run your own tools, and listen to what happens.",
      ],
      code: { file: MANAGED_FILE.name, blocks: ["managed"] },
      adds: ["room"],
    },
    {
      id: "objects",
      title: "Four objects to know",
      text: [
        "The agent: what it is. The environment: where it works. The session: one run. The vault: the keys to the services it calls without you.",
        "We take them one by one, starting with the place where it works. And between your backend and a session, everything goes through events: we'll see them with the session.",
      ],
      code: { file: MANAGED_FILE.name, blocks: ["objects"] },
    },
  ],
};
