import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../types";
import {
  agentReply,
  asksBackend,
  BACK_TO_BED,
  backendAnswers,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  replyTicketCall,
  ROUTE,
  userMessage,
} from "./shared";

/** Le plafond de la session, puis celui qui la relance, en centimes. */
const BUDGET_CENTS = 50;
const RAISED_BUDGET_CENTS = 100;
/** Ce que coûte chaque requête au modèle dans ce scénario, en centimes. */
const FIRST_REQUEST_CENTS = 30;
const SECOND_REQUEST_CENTS = 25;
const LAST_REQUEST_CENTS = 12;
const SPENT_AT_PAUSE_CENTS = FIRST_REQUEST_CENTS + SECOND_REQUEST_CENTS;
const CENTS_PER_DOLLAR = 100;

function dollars(cents: number): string {
  return `${(cents / CENTS_PER_DOLLAR).toFixed(2).replace(".", ",")} $`;
}

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "budget",
      lines: [
        "  // Un plafond de dépense, fixé à l'ouverture. Le montant est en centimes.",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        `    budget: { type: "limit", max_list_cost: { amount: "${BUDGET_CENTS}", currency: "USD" } },`,
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-budget",
      lines: [
        "    // Plafond atteint : la session est en pause, pas terminée.",
        '    if (event.type === "session.status_idle" && event.stop_reason.type === "budget_reached") {',
        "      if (!(await mayRaiseBudget(session.id))) break; // ta règle : continuer, ou s'arrêter là",
      ],
    },
    {
      id: "raise",
      lines: [
        "      // Un plafond plus haut que la dépense relance la session toute seule.",
        "      await client.beta.sessions.update(session.id, {",
        `        budget: { type: "limit", max_list_cost: { amount: "${RAISED_BUDGET_CENTS}", currency: "USD" } },`,
        "      });",
        "      continue;",
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

/** Un plafond de dépense par session : atteint, il met la session en pause sans rien perdre. */
export const BUDGET_LESSON: Lesson = {
  id: "budget",
  title: "Un budget par session",
  summary: "Un plafond de dépense : atteint, il met la session en pause, et le relever la relance.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "cap",
      title: "Un plafond, fixé à l'ouverture",
      text: [
        "Un agent tourne en boucle, et chaque requête au modèle se paie.",
        `Le budget est un plafond de dépense pour une session : ici, ${BUDGET_CENTS} centimes.`,
        "Il se fixe à l'ouverture. Une session ouverte sans budget ne peut pas en recevoir un après coup.",
      ],
      code: { file: ROUTE, blocks: ["budget"] },
      session: { budgetCents: BUDGET_CENTS },
    }),
    {
      id: "spend",
      title: "La jauge monte à chaque requête",
      text: [
        "Ton backend demande de répondre à deux tickets. Chaque fois que le modèle relit la pile, la dépense augmente.",
        `Après le premier ticket, la session a dépensé ${FIRST_REQUEST_CENTS} centimes. La requête suivante la porte à ${SPENT_AT_PAUSE_CENTS}.`,
        "Cette requête était déjà partie : elle va au bout, et l'agent demande son outil pour le deuxième ticket.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: [
        ...userMessage("Réponds aux tickets d'Alice et de Bruno."),
        { type: "spend", cents: FIRST_REQUEST_CENTS },
        ...asksBackend(replyTicketCall(1)),
        ...backendAnswers("Réponse envoyée à Alice."),
        { type: "spend", cents: SECOND_REQUEST_CENTS },
        ...asksBackend(replyTicketCall(2)),
        hop("agent", "app", "reply_ticket", "call"),
      ],
    },
    {
      id: "paused",
      title: "Plafond atteint : la session se met en pause",
      text: [
        `Ton backend renvoie le résultat. Avant de relancer le modèle, Anthropic compare la dépense au plafond : ${SPENT_AT_PAUSE_CENTS} centimes pour ${BUDGET_CENTS}.`,
        "Le résultat est enregistré, mais le modèle n'est pas relancé. « session.usage » donne la dépense, puis la session passe « idle » avec la raison « budget_reached ».",
        "Rien n'est perdu : la pile et le conteneur restent en place.",
      ],
      code: { file: ROUTE, blocks: ["on-budget"] },
      actions: [
        hop("app", "agent", "résultat", "result"),
        event("user.custom_tool_result", "Réponse envoyée à Bruno.", "app"),
        event("session.thread_status_idle", "budget_reached : le fil s'arrête avant sa prochaine requête", "session"),
        event("session.usage", `list_cost : ${dollars(SPENT_AT_PAUSE_CENTS)} dépensés`, "session"),
        event("session.status_idle", "budget_reached : le plafond de la session est atteint", "session"),
        { type: "status", status: "paused_budget" },
        { type: "mood", mood: "off" },
      ],
    },
    {
      id: "raise",
      title: "Relever le plafond relance la session",
      text: [
        "Aucun message ne relance une session en pause : un « user.message » serait refusé.",
        "Ton backend relève le plafond avec « sessions.update ». La session repart toute seule, là où elle s'était arrêtée.",
      ],
      code: { file: ROUTE, blocks: ["raise"] },
      actions: [
        { type: "budgetSet", cents: RAISED_BUDGET_CENTS },
        event("session.updated", `budget : plafond relevé à ${dollars(RAISED_BUDGET_CENTS)}`, "session"),
        event("session.status_running", "la session reprend", "session"),
        { type: "status", status: "running" },
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
        { type: "spend", cents: LAST_REQUEST_CENTS },
      ],
    },
    {
      id: "done",
      title: "L'agent termine",
      text: [
        "L'agent conclut, et le tour se termine normalement.",
        "Un budget borne le travail à venir, pas la dépense au centime près : la requête en cours va toujours au bout.",
        "« session.usage » précède en réalité chaque passage à « idle », pas seulement celui-ci. Les autres chapitres ne l'affichent pas, pour rester lisibles.",
      ],
      code: { file: ROUTE, blocks: ["on-budget", "on-idle"] },
      actions: [...agentReply("C'est réglé : j'ai répondu à Alice et à Bruno."), ...BACK_TO_BED],
    },
  ],
};
