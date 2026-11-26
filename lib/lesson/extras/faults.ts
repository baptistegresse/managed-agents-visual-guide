import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../types";
import {
  agentReply,
  asksBackend,
  backendAnswers,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  openSession,
  replyTicketCall,
  ROUTE,
  userMessage,
} from "./shared";

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    {
      id: "on-error",
      lines: [
        "    // Une panne est un événement comme un autre : elle n'interrompt pas la boucle.",
        '    if (event.type === "session.error") {',
        '      // retry_status annonce la suite : "retrying", "exhausted" ou "terminal".',
        "      logError(event.error.type, event.error.retry_status.type);",
        "    }",
        "",
      ],
    },
    {
      id: "on-rescheduled",
      lines: [
        "    // Panne passagère : Anthropic replanifie la session et réessaie. Rien à faire.",
        '    if (event.type === "session.status_rescheduled") continue;',
        "",
      ],
    },
    {
      id: "on-exhausted",
      lines: [
        "    // Tour en échec (essais épuisés, ou erreur qu'on ne peut pas réessayer) : la session reste utilisable.",
        '    if (event.type === "session.status_idle" && event.stop_reason.type === "retries_exhausted") {',
        "      return retryInSameSession(message); // ton code : la même session, la même demande",
        "    }",
        "",
      ],
    },
    {
      id: "on-terminated",
      lines: [
        "    // Définitif : cette session ne repartira plus.",
        '    if (event.type === "session.status_terminated") {',
        "      return retryInNewSession(message); // ton code : une session neuve, la même demande",
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

/**
 * Une panne arrive dans le flux comme un événement, et « retry_status » dit la suite :
 * elle se répare seule, le tour est perdu, ou la session est finie.
 */
export const FAULTS_LESSON: Lesson = {
  id: "faults",
  title: "Quand ça casse",
  summary: "Une panne arrive dans le flux comme un événement : « retry_status » dit si elle se répare seule, si le tour est perdu, ou si la session est finie.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "events",
      title: "Une panne n'est pas une exception",
      text: [
        "Quand quelque chose casse dans la session, ton code ne reçoit pas d'exception.",
        "La panne arrive dans le flux, comme le reste : un événement « session.error ».",
        "Son champ « retry_status » te dit quoi faire : « retrying », « exhausted » ou « terminal ».",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-error"] },
    }),
    {
      id: "transient",
      title: "Une panne passagère",
      text: [
        "Ton backend envoie une demande, et le modèle est momentanément surchargé.",
        "« session.error » décrit la panne, avec « retry_status » à « retrying ».",
        "Souvent, « session.status_rescheduled » suit : Anthropic replanifie la session.",
      ],
      code: { file: ROUTE, blocks: ["on-error", "on-rescheduled"] },
      actions: [
        ...userMessage("Réponds au ticket d'Alice."),
        event("session.error", "model_overloaded_error, retry_status : retrying", "session", true),
        event("session.status_rescheduled", "la session est replanifiée : Anthropic va réessayer", "session"),
        { type: "status", status: "rescheduling" },
        { type: "mood", mood: "stunned" },
      ],
    },
    {
      id: "retry",
      title: "Anthropic réessaie tout seul",
      text: [
        "Tu n'as rien à faire, sauf garder le flux ouvert.",
        "La session repasse « running ». L'agent reprend son tour et le mène au bout : il demande son outil, ton backend répond, il conclut.",
      ],
      code: { file: ROUTE, blocks: ["on-rescheduled", "on-idle"] },
      actions: [
        event("session.status_running", "la session reprend après la panne", "session"),
        { type: "status", status: "running" },
        { type: "modelRequest" },
        ...asksBackend(replyTicketCall(1)),
        hop("app", "agent", "résultat", "result"),
        ...backendAnswers("Réponse envoyée à Alice."),
        ...agentReply("C'est réglé : j'ai répondu à Alice."),
      ],
    },
    {
      id: "exhausted",
      title: "Essais épuisés : le tour est perdu, pas la session",
      text: [
        "Autre demande, autre panne. Anthropic réessaie, sans succès : « retry_status » vaut « exhausted ».",
        "Le tour est perdu, mais la session repasse « idle », avec le motif « retries_exhausted ».",
        "Elle reste utilisable. Lis le « session.error » qui précède : si la cause est passagère, ton backend peut renvoyer la demande dans la même session ; sinon (un problème de facturation, par exemple), corrige d'abord la cause.",
      ],
      code: { file: ROUTE, blocks: ["on-error", "on-exhausted"] },
      actions: [
        { type: "bubble", text: null },
        ...userMessage("Réponds au ticket de Bruno."),
        event("session.error", "model_overloaded_error, retry_status : retrying", "session", true),
        event("session.error", "model_overloaded_error, retry_status : exhausted", "session", true),
        event("session.status_idle", "retries_exhausted : le tour est perdu, la session reste utilisable", "session"),
        { type: "status", status: "idle" },
        { type: "mood", mood: "stunned" },
      ],
    },
    {
      id: "fatal",
      title: "Une panne définitive",
      text: [
        "Ton backend renvoie la demande, et la panne est d'une autre sorte : « retry_status » vaut « terminal ». Anthropic ne réessaiera pas.",
        "Le statut qui suit est « session.status_terminated ». La session n'acceptera plus aucun événement.",
      ],
      code: { file: ROUTE, blocks: ["on-error", "on-terminated"] },
      actions: [
        ...userMessage("Réponds au ticket de Bruno."),
        event("session.error", "unknown_error, retry_status : terminal", "session", true),
        event("session.status_terminated", "la session est terminée, définitivement", "session"),
        { type: "status", status: "terminated" },
        { type: "mood", mood: "off" },
      ],
    },
    {
      id: "new-session",
      title: "Une session neuve, et on recommence",
      text: [
        "Une session terminée ne repart pas : ton backend en ouvre une autre.",
        "Sa pile est neuve. À toi de lui renvoyer la demande, et ce que la précédente avait appris d'utile.",
      ],
      code: { file: ROUTE, blocks: ["on-terminated"] },
      actions: [openSession()],
    },
  ],
};
