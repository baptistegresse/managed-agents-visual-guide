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

const STOP_ROUTE = "app/api/support/stop/route.ts";

const STOP_FILE: CodeFile = {
  name: STOP_ROUTE,
  blocks: [
    {
      id: "route",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        "",
        "const client = new Anthropic();",
        "",
        "// Le bouton « Stop » de ton interface appelle cette route.",
        "export async function POST(request: Request) {",
        "  const { sessionId } = await request.json();",
        "",
      ],
    },
    {
      id: "remember",
      lines: [
        "  // Note que l'arrêt vient de toi : le motif d'arrêt, lui, ne le dira pas.",
        "  await markInterrupted(sessionId);",
        "",
      ],
    },
    {
      id: "interrupt",
      lines: [
        "  // Un événement comme un autre, envoyé à la session en cours.",
        "  // Tu peux l'envoyer à tout moment, même en plein tour.",
        "  await client.beta.sessions.events.send(sessionId, {",
        '    events: [{ type: "user.interrupt" }],',
        "  });",
        "",
        "  return Response.json({ success: true, data: null, error: null });",
        "}",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    LOOP_CLOSE,
    {
      id: "after",
      lines: [
        "",
        "  // Tour fini ou tour interrompu ? Le motif est le même : « end_turn ».",
        "  // Ta note fait la différence (ou le « user.interrupt » passé dans le flux juste avant).",
        "  const wasInterrupted = await isInterrupted(session.id);",
        "  return Response.json({ success: true, data: { answer, wasInterrupted }, error: null });",
      ],
    },
  ],
};

/** Arrêter un tour en cours : un événement de plus, et une session qui reste utilisable. */
export const INTERRUPT_LESSON: Lesson = {
  id: "interrupt",
  title: "Interrompre l'agent",
  summary: "Un bouton « Stop » : ton backend envoie « user.interrupt », et la session repasse « idle ».",
  files: [STOP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "long",
      title: "Un tour peut durer",
      text: [
        "Un tour peut être long : plusieurs tickets, plusieurs appels d'outils. Pendant ce temps, quelqu'un peut changer d'avis.",
        "Fermer le flux n'arrête rien : la session tourne chez Anthropic, pas chez toi. Pour l'arrêter, il faut le lui dire.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-idle"] },
    }),
    {
      id: "working",
      title: "L'agent est lancé sur une longue tâche",
      text: [
        "Ton backend demande : « Réponds à tous les tickets en attente. »",
        "L'agent répond d'abord à Alice, avec ton outil. Puis il passe au ticket suivant.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: [
        ...userMessage("Réponds à tous les tickets en attente."),
        ...asksBackend(replyTicketCall(1)),
        ...backendAnswers("Réponse envoyée à Alice."),
      ],
    },
    {
      id: "stop",
      title: "Quelqu'un appuie sur « Stop »",
      text: [
        "Ton interface appelle une autre route, qui envoie « user.interrupt » à la session.",
        "C'est un événement comme les autres : tu l'envoies avec « events.send », même en plein tour.",
        "Si le modèle est en train d'écrire, il s'arrête tout de suite. Si un outil tourne, l'arrêt peut prendre un peu plus longtemps.",
      ],
      code: { file: STOP_ROUTE, blocks: ["route", "interrupt"] },
      actions: [hop("app", "agent", "user.interrupt", "entry"), event("user.interrupt", "arrêt demandé", "app")],
    },
    {
      id: "boundary",
      title: "La session repasse « idle »",
      text: [
        "L'agent s'arrête en plein travail. Le ticket suivant n'est pas traité, et il n'y a pas de message final.",
        "Le flux annonce « session.status_idle » avec le motif « end_turn » : le même que pour un tour terminé normalement.",
        "Le motif ne distingue donc pas les deux. Le flux, si : « user.interrupt » y est passé juste avant. Le plus simple reste de retenir que tu as demandé l'arrêt.",
      ],
      code: { file: ROUTE, blocks: ["on-idle", "after"] },
      actions: [
        event("session.status_idle", "end_turn : le même motif qu'un tour terminé", "session"),
        { type: "status", status: "idle" },
        { type: "mood", mood: "idle" },
      ],
    },
    {
      id: "after",
      title: "La session reste utilisable",
      text: [
        "L'interruption arrête le tour, rien de plus : elle ne dit pas à l'agent quoi faire ensuite.",
        "La pile garde ce qui a été fait. Pour la suite, ton backend envoie un nouveau message, qui dit quoi faire à la place.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: [
        ...userMessage("Arrête pour aujourd'hui. Où en es-tu ?"),
        ...agentReply("J'ai répondu à Alice. Les autres tickets ne sont pas traités."),
      ],
    },
    {
      id: "recap",
      title: "Interrompre n'est pas terminer",
      text: [
        "Interrompre arrête le tour, pas la session : elle garde sa pile, et accepte la suite.",
        "L'interruption vise une session qui travaille : sur une session « idle », il n'y a pas de tour à arrêter.",
      ],
      code: { file: STOP_ROUTE, blocks: ["remember", "interrupt"] },
      actions: BACK_TO_BED,
    },
  ],
};
