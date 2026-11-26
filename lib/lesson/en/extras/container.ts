import { event } from "@/lib/workshop/effects";
import { WORKBENCH_STAND } from "@/lib/workshop/layout";
import type { CodeFile, Lesson } from "../../types";
import {
  agentReply,
  BACK_TO_BED,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  ROUTE,
  SETUP,
  SETUP_HEAD,
  userMessage,
  WALK_MS,
} from "./shared";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "agent",
      lines: [
        "const agent = await client.beta.agents.create({",
        '  name: "Support assistant",',
        '  model: "claude-haiku-5-5",',
        '  system: "You answer support customers.",',
        "  tools: [",
        "    REPLY_TICKET_TOOL,",
      ],
    },
    {
      id: "toolset",
      lines: [
        "    // The built-in toolset: bash, read, write, edit, glob, grep.",
        "    // These tools run in the session's container, not on your side.",
        "    {",
        '      type: "agent_toolset_20260401",',
      ],
    },
    {
      id: "policy",
      lines: [
        '      // Who decides that a call goes out: "always_allow", "always_ask" or "auto".',
        '      default_config: { enabled: true, permission_policy: { type: "auto" } },',
      ],
    },
    {
      id: "web-off",
      lines: [
        "      // The two web tools stay off: they have their own chapter.",
        "      configs: [",
        '        { name: "web_search", enabled: false },',
        '        { name: "web_fetch", enabled: false },',
        "      ],",
        "    },",
        "  ],",
        "});",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "mount",
      lines: [
        "  // The week's export, uploaded once with the Files API.",
        "  const upload = await client.files.upload({ file: await exportTickets() });",
        "",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "    // Mounted at startup under /mnt/session/uploads/: the agent reads it like an ordinary file.",
        '    resources: [{ type: "file", file_id: upload.id, mount_path: "/tickets.csv" }],',
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-builtin",
      lines: [
        "    // Built-in tools go through the stream. Nothing to send back, unless “auto” asks for your approval.",
        '    if (event.type === "agent.tool_use") logStep(event.name, event.input);',
        '    if (event.type === "agent.tool_result" && event.is_error) logError("Tool failed", event.tool_use_id);',
        "",
      ],
    },
    LOOP_CLOSE,
    {
      id: "outputs",
      lines: [
        "",
        "  // What the agent wrote in /mnt/session/outputs/ can be downloaded after the turn.",
        "  // A file sometimes takes a few seconds to appear: if it is missing, list again.",
        '  const outputs = client.beta.files.list({ scope_id: session.id, betas: ["managed-agents-2026-04-01"] });',
        "  for await (const file of outputs) {",
        "    if (!file.downloadable) continue; // the file you mounted cannot be downloaded",
        "    const content = await client.files.download(file.id);",
        "    await saveReport(file.filename, await content.text());",
        "  }",
      ],
    },
  ],
};

const COUNT_COMMAND = "tail -n +2 /mnt/session/uploads/tickets.csv | cut -d, -f3 | sort | uniq -c";
const COUNT_LINES = ["   4 broken parcel", "   2 refund", "   1 delay"];
const REPORT_PATH = "/mnt/session/outputs/report.md";
const REPORT_FILE = "report.md";
const JUDGED_SAFE = { type: "verdict", verdict: { text: "auto: judged safe", tone: "ok" } } as const;

/** Built-in tools run in the session's container: no round trip to your backend. */
export const CONTAINER_LESSON: Lesson = {
  id: "container",
  title: "The container: bash and files",
  summary: "Tools that run in the agent's room, with no round trip to your backend.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "toolset",
      title: "Tools that run in the room",
      text: [
        "So far, the agent could only act through your backend. The built-in toolset gives it bash, a terminal, and file tools.",
        "They run in the session's container, at Anthropic: that is the workbench, at the back of the room.",
        "For this session, your backend also mounted a file there: the export of the week's tickets.",
      ],
      code: { file: SETUP, blocks: ["toolset", "web-off"] },
      adds: ["bench"],
      sets: { hasMountedFile: true },
      session: { extraToolLines: ["bash, read, write, edit, glob, grep: run in the session's container"] },
    }),
    {
      id: "policy",
      title: "Who decides that a call goes out?",
      text: [
        "Each built-in tool follows a permission policy. “always_allow” runs it without asking anything.",
        "“always_ask” waits for your approval before every call, like for a third-party service tool.",
        "“auto” lets Anthropic judge each call: it goes out, it is refused, or it waits for your approval.",
      ],
      code: { file: SETUP, blocks: ["policy"] },
    },
    {
      id: "bash",
      title: "The agent goes to the workbench",
      text: [
        "Your backend asks: “Count the week's tickets by reason.”",
        "The agent asks for “bash”. The event is called “agent.tool_use”, and it never leaves the room: the command runs on the spot.",
        "Under “auto”, Anthropic first judged the call safe.",
      ],
      code: { file: ROUTE, blocks: ["mount"] },
      actions: [
        ...userMessage("Count the week's tickets by reason."),
        event("agent.tool_use", `bash: ${COUNT_COMMAND}`, "agent"),
        JUDGED_SAFE,
        { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
        { type: "terminal", lines: [`$ ${COUNT_COMMAND}`] },
      ],
    },
    {
      id: "result",
      title: "The result does not go through you",
      text: [
        "The result joins the stack with “agent.tool_result”, and the model re-reads the stack.",
        "Your backend sees both events go by in the stream. But it ran nothing and, since the call was judged safe, has nothing to send back: no round trip.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-builtin"] },
      actions: [
        { type: "terminal", lines: [`$ ${COUNT_COMMAND}`, ...COUNT_LINES] },
        event("agent.tool_result", "4 broken parcel, 2 refund, 1 delay", "sandbox"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "file",
      title: "The agent writes a file",
      text: [
        "With the “write” tool, the agent saves its report in “/mnt/session/outputs/”.",
        "Everything it writes in this folder is kept. Your backend can download it once the turn is over, sometimes after a few seconds of waiting.",
      ],
      code: { file: ROUTE, blocks: ["outputs"] },
      actions: [
        event("agent.tool_use", `write: ${REPORT_PATH}`, "agent"),
        JUDGED_SAFE,
        { type: "mood", mood: "working" },
        { type: "terminal", lines: [`write ${REPORT_PATH}`, "File written."] },
        event("agent.tool_result", `File written: ${REPORT_FILE}`, "sandbox"),
        { type: "file", name: REPORT_FILE },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "In the room, not on your side",
      text: [
        "The agent announces that the report is ready, and the turn ends.",
        "Remember where each thing runs: a custom tool on your side, a built-in tool in the container.",
        "In both cases, everything goes through the same event stream.",
      ],
      code: { file: ROUTE, blocks: ["on-idle", "outputs"] },
      actions: [...agentReply("The report is ready: 4 broken parcels, 2 refunds, 1 delay."), ...BACK_TO_BED],
    },
  ],
};
