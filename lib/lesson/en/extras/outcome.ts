import { event, type Effect, type OutcomeView } from "@/lib/workshop/effects";
import { WORKBENCH_STAND } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson, type StepAction } from "../../types";
import { BACK_TO_BED, LOOP_CLOSE, LOOP_OPEN, openingStep, ROUTE, WAKE_UP, WALK_MS } from "./shared";

const GOAL = "Write the returns FAQ in returns-faq.md";
const FAQ_PATH = "/mnt/session/outputs/returns-faq.md";
const FAQ_FILE = "returns-faq.md";
const MAX_ITERATIONS = 3;
/** The rubric: criteria that the grader checks one by one. */
const CRITERIA = [
  "The file returns-faq.md exists",
  "It gives the return deadline: 30 days",
  "It gives the address to send the parcel back to",
] as const;
/** The criterion that the first attempt does not meet. */
const MISSING_CRITERION = CRITERIA[2];

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "rubric",
      lines: [
        "  // The rubric: criteria that can be checked one by one.",
        "  const rubric = [",
        ...CRITERIA.map((criterion) => `    "- ${criterion}",`),
        '  ].join("\\n");',
        "",
      ],
    },
    {
      id: "define",
      lines: [
        "  // Instead of the “user.message”: the outcome, its rubric, and a number of attempts.",
        "  await client.beta.sessions.events.send(session.id, {",
        "    events: [",
        "      {",
        '        type: "user.define_outcome",',
        `        description: "${GOAL}",`,
        '        rubric: { type: "text", content: rubric },',
        `        max_iterations: ${MAX_ITERATIONS},`,
        "      },",
        "    ],",
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-grade",
      lines: [
        "    // The grader has scored an attempt. Nothing to send back: if the result is",
        '    // "needs_revision", the agent starts again by itself.',
        '    if (event.type === "span.outcome_evaluation_end") {',
        "      logStep(event.result, event.explanation);",
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

/** The grader's card: where the outcome stands, and which criteria are met. */
function graderCard(iteration: number, phase: OutcomeView["phase"], unmet: readonly string[]): Effect {
  return {
    type: "outcome",
    outcome: {
      description: GOAL,
      criteria: CRITERIA.map((text) => ({ text, isMet: !unmet.includes(text) })),
      iteration,
      maxIterations: MAX_ITERATIONS,
      phase,
    },
  };
}

/** The agent works at the workbench: it writes or fixes the file, then the model re-reads the stack. */
function fileWork(tool: "write" | "edit", result: string): readonly StepAction[] {
  return [
    { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
    { type: "mood", mood: "working" },
    event("agent.tool_use", `${tool}: ${FAQ_PATH}`, "agent"),
    { type: "terminal", lines: [`${tool} ${FAQ_PATH}`, result] },
    event("agent.tool_result", result, "sandbox"),
    { type: "file", name: FAQ_FILE },
    { type: "modelRequest" },
  ];
}

/** An outcome and its rubric: a separate grader scores each attempt, and the agent fixes its work. */
export const OUTCOME_LESSON: Lesson = {
  id: "outcome",
  title: "A graded outcome",
  summary: "You describe the expected result and its rubric: a grader scores it, and the agent fixes its work.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "goal",
      title: "Say what “done” means",
      text: [
        "With a “user.message”, the agent stops when it thinks it is done.",
        "An outcome describes the expected result and attaches a rubric: a list of checkable criteria.",
        "It replaces the message that starts the work: the agent begins as soon as it receives it. You can still send a “user.message” later to steer it, but none is required.",
      ],
      code: { file: ROUTE, blocks: ["rubric", "define"] },
      adds: ["bench"],
      session: { extraToolLines: ["read, write, edit: file tools, run in the session's container"] },
    }),
    {
      id: "work",
      title: "The agent gets to work",
      text: [
        "Your backend sends “user.define_outcome”. The agent wakes up and writes the returns FAQ in a file, at the workbench.",
        "So far, nothing new: it is the work of an ordinary turn. It uses the built-in file tools, which the agent must have enabled (“agent_toolset_20260401”).",
      ],
      code: { file: ROUTE, blocks: ["define"] },
      actions: [
        hop("app", "agent", "user.define_outcome", "entry"),
        event("user.define_outcome", GOAL, "app"),
        graderCard(0, "working", CRITERIA),
        ...WAKE_UP,
        ...fileWork("write", `File written: ${FAQ_FILE}`),
      ],
    },
    {
      id: "grading",
      title: "A grader reviews the work",
      text: [
        "When the agent thinks it is done, a grader takes over: “span.outcome_evaluation_start”.",
        "It works separately, with its own context window: it is neither the agent nor your backend. It compares the file to the rubric, criterion by criterion.",
      ],
      code: { file: ROUTE, blocks: ["rubric"] },
      actions: [
        event("span.outcome_evaluation_start", "iteration 0: the first attempt", "grader"),
        graderCard(0, "grading", CRITERIA),
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "revision",
      title: "Needs revision: the agent starts again",
      text: [
        "The verdict arrives in “span.outcome_evaluation_end”: “needs_revision”. The return address is missing.",
        "Your backend has nothing to send back. The agent receives the grader's explanation, and fixes its file on its own.",
      ],
      code: { file: ROUTE, blocks: ["on-grade"] },
      actions: [
        event("span.outcome_evaluation_end", "needs_revision: the return address is missing", "grader"),
        graderCard(0, "needs_revision", [MISSING_CRITERION]),
        ...fileWork("edit", `File edited: ${FAQ_FILE}`),
      ],
    },
    {
      id: "satisfied",
      title: "Second attempt: satisfied",
      text: [
        "The grader reads the fixed file. This time, every criterion is met: the result is “satisfied”.",
        "The session goes back to “idle”, and your backend can download the file.",
        "If the attempts had run out first, the result would have been “max_iterations_reached”.",
      ],
      code: { file: ROUTE, blocks: ["on-grade", "on-idle"] },
      actions: [
        event("span.outcome_evaluation_start", "iteration 1: the second attempt", "grader"),
        event("span.outcome_evaluation_end", "satisfied: all three criteria are met", "grader"),
        graderCard(1, "satisfied", []),
        event("session.status_idle", "the outcome is reached: the session waits for what comes next", "session"),
        { type: "status", status: "idle" },
        ...BACK_TO_BED,
      ],
    },
  ],
};
