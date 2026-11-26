import { event, type Effect, type OutcomeView } from "@/lib/workshop/effects";
import { WORKBENCH_STAND } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson, type StepAction } from "../types";
import { BACK_TO_BED, LOOP_CLOSE, LOOP_OPEN, openingStep, ROUTE, WAKE_UP, WALK_MS } from "./shared";

const GOAL = "Rédige la FAQ des retours dans faq-retours.md";
const FAQ_PATH = "/mnt/session/outputs/faq-retours.md";
const FAQ_FILE = "faq-retours.md";
const MAX_ITERATIONS = 3;
/** Le barème : des critères que le correcteur vérifie un par un. */
const CRITERIA = [
  "Le fichier faq-retours.md existe",
  "Il donne le délai de retour : 30 jours",
  "Il donne l'adresse où renvoyer le colis",
] as const;
/** Le critère que le premier essai ne remplit pas. */
const MISSING_CRITERION = CRITERIA[2];

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "rubric",
      lines: [
        "  // Le barème : des critères qu'on peut vérifier un par un.",
        "  const rubric = [",
        ...CRITERIA.map((criterion) => `    "- ${criterion}",`),
        '  ].join("\\n");',
        "",
      ],
    },
    {
      id: "define",
      lines: [
        "  // À la place du « user.message » : l'objectif, son barème, et un nombre d'essais.",
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
        "    // Le correcteur a noté un essai. Rien à renvoyer : si le résultat est",
        '    // "needs_revision", l\'agent repart tout seul.',
        '    if (event.type === "span.outcome_evaluation_end") {',
        "      logStep(event.result, event.explanation);",
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

/** La carte du correcteur : où en est l'objectif, et quels critères sont remplis. */
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

/** L'agent travaille à l'établi : il écrit ou corrige le fichier, puis le modèle relit la pile. */
function fileWork(tool: "write" | "edit", result: string): readonly StepAction[] {
  return [
    { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
    { type: "mood", mood: "working" },
    event("agent.tool_use", `${tool} : ${FAQ_PATH}`, "agent"),
    { type: "terminal", lines: [`${tool} ${FAQ_PATH}`, result] },
    event("agent.tool_result", result, "sandbox"),
    { type: "file", name: FAQ_FILE },
    { type: "modelRequest" },
  ];
}

/** Un objectif et son barème : un correcteur séparé note chaque essai, et l'agent corrige. */
export const OUTCOME_LESSON: Lesson = {
  id: "outcome",
  title: "Un objectif noté",
  summary: "Tu décris le résultat attendu et son barème : un correcteur note, et l'agent corrige.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "goal",
      title: "Dire ce que « terminé » veut dire",
      text: [
        "Avec un « user.message », l'agent s'arrête quand lui estime avoir fini.",
        "Un objectif (un « outcome ») décrit le résultat attendu et joint un barème : une liste de critères vérifiables.",
        "Il remplace le message qui lance le travail : l'agent démarre dès qu'il le reçoit. Tu peux encore envoyer un « user.message » ensuite pour l'orienter, mais ce n'est pas nécessaire.",
      ],
      code: { file: ROUTE, blocks: ["rubric", "define"] },
      adds: ["bench"],
      session: { extraToolLines: ["read, write, edit : outils de fichiers, exécutés dans le conteneur de la session"] },
    }),
    {
      id: "work",
      title: "L'agent se met au travail",
      text: [
        "Ton backend envoie « user.define_outcome ». L'agent se réveille et rédige la FAQ des retours dans un fichier, à l'établi.",
        "Jusque-là, rien de nouveau : c'est le travail d'un tour ordinaire. Il utilise les outils de fichiers intégrés, que l'agent doit avoir activés (« agent_toolset_20260401 »).",
      ],
      code: { file: ROUTE, blocks: ["define"] },
      actions: [
        hop("app", "agent", "user.define_outcome", "entry"),
        event("user.define_outcome", GOAL, "app"),
        graderCard(0, "working", CRITERIA),
        ...WAKE_UP,
        ...fileWork("write", `Fichier écrit : ${FAQ_FILE}`),
      ],
    },
    {
      id: "grading",
      title: "Un correcteur relit le travail",
      text: [
        "Quand l'agent pense avoir fini, un correcteur prend le relais : « span.outcome_evaluation_start ».",
        "Il travaille à part, avec sa propre fenêtre de contexte : ce n'est ni l'agent, ni ton backend. Il compare le fichier au barème, critère par critère.",
      ],
      code: { file: ROUTE, blocks: ["rubric"] },
      actions: [
        event("span.outcome_evaluation_start", "itération 0 : le premier essai", "grader"),
        graderCard(0, "grading", CRITERIA),
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "revision",
      title: "À revoir : l'agent repart",
      text: [
        "Le verdict arrive dans « span.outcome_evaluation_end » : « needs_revision ». Il manque l'adresse de retour.",
        "Ton backend n'a rien à renvoyer. L'agent reçoit l'explication du correcteur, et corrige son fichier de lui-même.",
      ],
      code: { file: ROUTE, blocks: ["on-grade"] },
      actions: [
        event("span.outcome_evaluation_end", "needs_revision : l'adresse de retour manque", "grader"),
        graderCard(0, "needs_revision", [MISSING_CRITERION]),
        ...fileWork("edit", `Fichier modifié : ${FAQ_FILE}`),
      ],
    },
    {
      id: "satisfied",
      title: "Deuxième essai : satisfait",
      text: [
        "Le correcteur relit le fichier corrigé. Cette fois, tous les critères sont remplis : le résultat est « satisfied ».",
        "La session repasse « idle », et ton backend peut télécharger le fichier.",
        "Si les essais avaient été épuisés avant, le résultat aurait été « max_iterations_reached ».",
      ],
      code: { file: ROUTE, blocks: ["on-grade", "on-idle"] },
      actions: [
        event("span.outcome_evaluation_start", "itération 1 : le deuxième essai", "grader"),
        event("span.outcome_evaluation_end", "satisfied : les trois critères sont remplis", "grader"),
        graderCard(1, "satisfied", []),
        event("session.status_idle", "l'objectif est atteint : la session attend la suite", "session"),
        { type: "status", status: "idle" },
        ...BACK_TO_BED,
      ],
    },
  ],
};
