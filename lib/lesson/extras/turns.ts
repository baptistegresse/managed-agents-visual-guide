import { hop, type CodeFile, type Lesson } from "../types";
import {
  agentReply,
  asksBackend,
  BACK_TO_BED,
  backendAnswers,
  openingStep,
  PREVIOUS_TURN,
  replyTicketCall,
  ROUTE,
  userMessage,
} from "./shared";

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "route",
      lines: [
        "// Ta route reçoit maintenant le ticket avec le message.",
        "export async function POST(request: Request) {",
        "  const { ticketId, message } = await request.json();",
        "",
      ],
    },
    {
      id: "find-session",
      lines: [
        "  // Une session par ticket. Son identifiant est rangé dans ta base :",
        "  // la deuxième demande retrouve la session de la première.",
        "  const sessionId = (await findSessionId(ticketId)) ?? (await openSession(ticketId));",
        "",
      ],
    },
    {
      id: "send",
      lines: [
        "  // Le reste ne change pas : le flux d'abord, puis le message.",
        "  const stream = await client.beta.sessions.events.stream(sessionId);",
        "  await client.beta.sessions.events.send(sessionId, {",
        '    events: [{ type: "user.message", content: [{ type: "text", text: message }] }],',
        "  });",
        "",
      ],
    },
    {
      id: "listen",
      lines: [
        "  // Et la même boucle : appels d'outils, réponse, fin du tour.",
        "  const answer = await listenUntilIdle(sessionId, stream);",
        "  return Response.json({ success: true, data: { answer }, error: null });",
        "}",
        "",
      ],
    },
    {
      id: "open-session",
      lines: [
        "// Seule la toute première demande d'un ticket ouvre une session.",
        "async function openSession(ticketId: string): Promise<string> {",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "  });",
        "  await saveSessionId(ticketId, session.id);",
        "  return session.id;",
        "}",
      ],
    },
  ],
};

/** Le deuxième message ne nomme ni le client ni le ticket : seule la pile permet de le comprendre. */
const FOLLOW_UP = "Elle dit que ça ne marche toujours pas. Relance-la.";

/** Une conversation : plusieurs tours dans la même session, dont la pile garde tout. */
export const TURNS_LESSON: Lesson = {
  id: "turns",
  title: "Une conversation en plusieurs tours",
  summary: "Garder l'identifiant de la session, et lui renvoyer un message : la pile se souvient du tour d'avant.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "kept",
      title: "Une session ne s'arrête pas après un tour",
      text: [
        "Dans le chapitre sur la session, ta route en ouvrait une neuve à chaque demande. Rien n'y oblige.",
        "Après un tour, la session repasse « idle » : elle attend la suite. Regarde la pile : le premier tour, celui d'Alice, y est toujours.",
      ],
      code: { file: ROUTE, blocks: ["open-session"] },
      actions: PREVIOUS_TURN,
    }),
    {
      id: "id",
      title: "Ce qui relie deux demandes : l'identifiant",
      text: [
        "Pour continuer une conversation, ton backend n'a besoin que d'une chose : l'identifiant de la session.",
        "Il le range dans sa base, à côté du ticket. À la demande suivante, il le retrouve au lieu d'ouvrir une session.",
      ],
      code: { file: ROUTE, blocks: ["find-session", "open-session"] },
    },
    {
      id: "second",
      title: "Un deuxième message, dans la même session",
      text: [
        "La cliente a répondu. Ton backend envoie : « Elle dit que ça ne marche toujours pas. Relance-la. »",
        "Le message ne dit ni qui, ni quel ticket. L'agent le sait quand même : il relit toute la pile, premier tour compris.",
        "Il redemande « reply_ticket », pour le ticket 1.",
      ],
      code: { file: ROUTE, blocks: ["send"] },
      actions: [...userMessage(FOLLOW_UP), ...asksBackend(replyTicketCall(1)), hop("agent", "app", "reply_ticket", "call")],
    },
    {
      id: "answer",
      title: "Le deuxième tour s'empile sur le premier",
      text: [
        "Ton backend exécute l'outil et renvoie le résultat. L'agent conclut, et la session repasse « idle ».",
        "La pile contient maintenant les deux tours, dans l'ordre. Une conversation, c'est cela : une seule session, plusieurs tours.",
      ],
      code: { file: ROUTE, blocks: ["listen"] },
      actions: [
        hop("app", "agent", "résultat", "result"),
        ...backendAnswers("Relance envoyée à Alice."),
        ...agentReply("C'est fait : j'ai relancé Alice."),
      ],
    },
    {
      id: "rule",
      title: "Une session par conversation",
      text: [
        "Un bon repère : une session par conversation. Ici, une par ticket.",
        "Un message envoyé pendant que l'agent travaille est mis en file, et traité à son tour. Une exception : tant que la session attend le résultat d'un outil, elle refuse les nouveaux messages.",
        "Mais la pile ne fait que grandir. Une session qui dure très longtemps finit par être résumée : c'est l'annexe « Quand la pile est pleine ».",
      ],
      code: { file: ROUTE, blocks: ["find-session"] },
      actions: BACK_TO_BED,
    },
  ],
};
