import { hop, type CodeFile, type Lesson } from "../types";
import { agentReply, asksBackend, BACK_TO_BED, backendAnswers, openingStep, replyTicketCall, userMessage } from "./shared";

const WEBHOOK_FILE: CodeFile = {
  name: "app/api/webhooks/support/route.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { answerToolCalls } from "../../support/loop"; // la boucle de la leçon principale',
        'import { sessionFor } from "./sessions"; // ton code : la session ouverte pour ce client',
        'import { verifySignature } from "./signature"; // ton code : le secret partagé avec la boîte de support',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "route",
      lines: [
        "// La boîte de support appelle cette adresse à chaque nouveau ticket.",
        "export async function POST(request: Request) {",
      ],
    },
    {
      id: "verify",
      lines: [
        "  // 1. N'importe qui peut appeler cette adresse : vérifie d'abord la signature.",
        "  const ticket = await verifySignature(request); // null si elle est fausse",
        '  if (!ticket) return new Response("Signature invalide", { status: 401 });',
        "",
      ],
    },
    {
      id: "send",
      lines: [
        "  // 2. Le flux d'abord, puis le ticket, envoyé comme un « user.message ».",
        "  const sessionId = await sessionFor(ticket.customer);",
        "  const stream = await client.beta.sessions.events.stream(sessionId);",
        "  await client.beta.sessions.events.send(sessionId, {",
        "    events: [",
        "      {",
        '        type: "user.message",',
        '        content: [{ type: "text", text: `Ticket ${ticket.id} (${ticket.customer}) : ${ticket.text}` }],',
        "      },",
        "    ],",
        "  });",
        "",
      ],
    },
    {
      id: "loop",
      lines: [
        "  // 3. La même boucle que dans la leçon principale : elle exécute",
        "  //    « reply_ticket » quand l'agent le demande, jusqu'à la fin du tour.",
        "  await answerToolCalls(stream, sessionId);",
        "",
      ],
    },
    {
      id: "respond",
      lines: [
        "  // 4. La boîte de support n'attend qu'un accusé de réception.",
        "  return new Response(null, { status: 204 });",
        "}",
      ],
    },
  ],
};

const FILE = WEBHOOK_FILE.name;
const TICKET_MESSAGE = "Ticket 1 (Alice) : Mon colis est arrivé cassé.";

/** Un ticket arrive dans la boîte de support : c'est elle, et non un clic, qui réveille l'agent. */
export const WEBHOOK_LESSON: Lesson = {
  id: "webhook",
  title: "Un client écrit : le webhook",
  summary: "Un ticket arrive dans ta boîte de support et réveille l'agent, sans que personne ne clique.",
  files: [WEBHOOK_FILE],
  steps: [
    openingStep({
      id: "nobody",
      title: "Personne n'a cliqué",
      text: [
        "Dans la leçon principale, quelqu'un écrivait dans ton interface, et ton interface appelait ta route.",
        "Ici, personne n'est devant l'écran : c'est la boîte de support qui prévient ton serveur quand un client écrit.",
        "Cet appel d'un système à un autre s'appelle un webhook.",
      ],
      code: { file: FILE, blocks: ["imports", "route"] },
    }),
    {
      id: "ticket",
      title: "Un client écrit",
      text: [
        "Alice écrit à ta boîte de support : « Mon colis est arrivé cassé. » La boîte de support appelle aussitôt ton serveur.",
        "Rien n'a encore touché la pièce : l'agent dort.",
        "Cette adresse est publique. Avant de croire le ticket, ta route vérifie la signature de l'appel.",
      ],
      code: { file: FILE, blocks: ["verify"] },
      actions: [hop("desk", "webhook", "nouveau ticket", "entry")],
    },
    {
      id: "message",
      title: "Ton serveur envoie le message",
      text: [
        "Ta route ouvre le flux de la session, puis envoie le ticket comme un « user.message ».",
        "Pour l'agent, rien ne distingue ce message de celui de la leçon principale : il se réveille, et le modèle relit la pile.",
      ],
      code: { file: FILE, blocks: ["send"] },
      actions: userMessage(TICKET_MESSAGE, "webhook"),
    },
    {
      id: "tool",
      title: "La suite, tu la connais",
      text: [
        "L'agent demande « reply_ticket », ton backend l'exécute et renvoie le résultat.",
        "C'est la boucle de la leçon principale. Voilà pourquoi ta route garde le flux ouvert après avoir envoyé le message.",
      ],
      code: { file: FILE, blocks: ["loop"] },
      actions: [
        ...asksBackend(replyTicketCall(1)),
        hop("app", "agent", "résultat", "result"),
        ...backendAnswers("Réponse envoyée à Alice."),
      ],
    },
    {
      id: "done",
      title: "Alice a sa réponse",
      text: [
        "L'agent conclut, la session repasse « idle », et ta route accuse réception à la boîte de support.",
        "Un webhook n'est qu'une autre porte d'entrée. Au bout, c'est toujours ton backend qui envoie un « user.message ».",
      ],
      code: { file: FILE, blocks: ["respond"] },
      actions: [...agentReply("C'est réglé : j'ai répondu à Alice."), ...BACK_TO_BED],
    },
  ],
};
