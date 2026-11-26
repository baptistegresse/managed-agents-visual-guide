import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson, type StepAction } from "../types";
import { asksBackend, BACK_TO_BED, backendAnswers, END_OF_TURN, LOOP_CLOSE, LOOP_OPEN, openingStep, ROUTE, userMessage } from "./shared";

interface TicketToRead {
  readonly id: number;
  readonly customer: string;
  readonly problem: string;
}

/** Les tickets que ton backend fait lire à l'agent, l'un après l'autre, dans la même session. */
const FIRST: TicketToRead = { id: 1, customer: "Alice", problem: "Je n'arrive plus à changer mon mot de passe." };
const NEXT: readonly TicketToRead[] = [
  { id: 2, customer: "Bruno", problem: "Je n'ai pas reçu ma commande." },
  { id: 3, customer: "Chloé", problem: "Je voudrais modifier mon adresse de livraison." },
  { id: 4, customer: "David", problem: "J'ai été débité deux fois." },
];
const LAST: TicketToRead = { id: 5, customer: "Emma", problem: "Mon colis est arrivé abîmé." };

/**
 * Tout le fil d'un ticket, tel que ton outil le renvoie : c'est long, et c'est
 * ce texte entier qui entre dans la pile de l'agent.
 */
function thread({ customer, problem }: TicketToRead): string {
  return [
    `Fil du ticket de ${customer} : « ${problem} »`,
    "Le client a écrit lundi matin, puis a relancé mardi et encore mercredi.",
    "Il donne son numéro de commande, son adresse de livraison et le moyen de paiement utilisé.",
    "Le support a répondu une première fois pour demander une capture d'écran, que le client a envoyée le jour même.",
    "Un collègue a ensuite ajouté une note interne : le problème semble venir d'une mise à jour récente.",
    "Depuis, le ticket attend une réponse définitive, et le client demande à être rappelé.",
  ].join(" ");
}

/** Un ticket lu de bout en bout : la demande, l'appel, le fil renvoyé par ton backend, le résumé de l'agent. */
function readTicket(ticket: TicketToRead): readonly StepAction[] {
  return [
    ...userMessage(`Lis le ticket de ${ticket.customer} et résume-le.`),
    ...asksBackend(`read_ticket({"ticket":${ticket.id}})`),
    ...backendAnswers(thread(ticket)),
    event("agent.message", `Résumé : ${ticket.customer} attend une réponse sur « ${ticket.problem} »`, "agent"),
    ...END_OF_TURN,
  ];
}

const RESULT_HOP = hop("app", "agent", "tout le fil du ticket", "result");

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    {
      id: "big-result",
      lines: [
        "    // Ce que ton outil renvoie entre tel quel dans la pile de l'agent.",
        '    if (event.type === "agent.custom_tool_use") {',
        "      const thread = await readTicket(event.input.ticket); // tout le fil : long",
        "      await client.beta.sessions.events.send(session.id, {",
        "        events: [",
        "          {",
        '            type: "user.custom_tool_result",',
        "            custom_tool_use_id: event.id,",
        '            content: [{ type: "text", text: thread }],',
        "          },",
        "        ],",
        "      });",
        "    }",
        "",
      ],
    },
    {
      id: "on-compact",
      lines: [
        "    // La pile approchait de sa limite : Anthropic a résumé l'historique.",
        "    // Rien à répondre. L'événement dit seulement quand c'est arrivé.",
        '    if (event.type === "agent.thread_context_compacted") {',
        '      logInfo("pile compactée", { at: event.processed_at });',
        "    }",
        "",
      ],
    },
    LOOP_CLOSE,
  ],
};

/**
 * Quand la pile est pleine : elle ne fait que grandir, les résultats d'outils la
 * remplissent vite, et au seuil la plateforme résume l'historique.
 */
export const COMPACTION_LESSON: Lesson = {
  id: "compaction",
  title: "Quand la pile est pleine",
  summary: "La fenêtre de contexte a une limite : au seuil, la plateforme résume l'historique.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "grows",
      title: "La pile ne fait que grandir",
      text: [
        "Dans une session, chaque message, chaque appel d'outil et chaque résultat s'ajoute à la pile. Rien n'en sort.",
        "Le modèle la relit en entier à chaque tour : plus elle est haute, plus chaque tour coûte cher.",
        "Elle a aussi une taille maximale, le cadre en pointillés. Ici il est minuscule, pour qu'on le voie se remplir.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      session: { extraToolLines: ["read_ticket : lit tout le fil d'un ticket"] },
    }),
    {
      id: "heavy",
      title: "Un résultat d'outil pèse lourd",
      text: [
        "Ton backend demande de lire le ticket d'Alice. L'agent appelle « read_ticket », et ton backend lui renvoie tout le fil.",
        "Regarde la pile : le résultat, en bleu, est bien plus épais que la demande. Ce sont les résultats d'outils qui remplissent une pile.",
      ],
      code: { file: ROUTE, blocks: ["big-result"] },
      actions: [...readTicket(FIRST), RESULT_HOP],
    },
    {
      id: "near",
      title: "La pile approche du seuil",
      text: [
        "Ton backend enchaîne avec trois autres tickets, dans la même session.",
        "Le trait rouge est le seuil. Au-delà, il ne resterait plus assez de place pour que l'agent travaille.",
      ],
      code: { file: ROUTE, blocks: ["big-result"] },
      actions: [...NEXT.flatMap(readTicket), RESULT_HOP],
    },
    {
      id: "compacted",
      title: "Seuil franchi : la plateforme résume",
      text: [
        "Au cinquième ticket, la pile passe le seuil. Anthropic résume alors l'historique : un bloc sombre, bien plus mince, le remplace.",
        "L'événement « agent.thread_context_compacted » le signale dans le flux. Il ne dit pas combien de tokens ont été retirés.",
        "Aucun événement d'arrêt ne l'accompagne : ici, l'agent poursuit son tour. La doc ne décrit pas ce que devient le tour au-delà de cet événement.",
      ],
      code: { file: ROUTE, blocks: ["on-compact"] },
      actions: readTicket(LAST),
    },
    {
      id: "lost",
      title: "Ce qui reste, ce qui s'efface",
      text: [
        "Les consignes ne bougent pas : elles sont fixées pour toute la session. C'est l'historique qui est condensé.",
        "Ici, le détail du ticket d'Alice n'est plus dans la pile : il n'en reste qu'un résumé. La doc ne dit pas ce qu'un résumé garde : pars du principe que tout détail peut disparaître.",
        "Ce qui doit survivre à coup sûr se range ailleurs : dans un fichier du conteneur, ou dans la mémoire.",
      ],
      code: { file: ROUTE, blocks: ["on-compact"] },
    },
    {
      id: "backend",
      title: "Côté backend : rien à faire, mais à surveiller",
      text: [
        "La compaction est automatique : ton backend n'a rien à répondre.",
        "Elle reste utile à suivre. Une session qui compacte souvent est trop longue, ou lit trop à chaque fois.",
        "Ouvrir une session par ticket, et faire renvoyer à tes outils seulement l'utile, garde les piles courtes.",
      ],
      code: { file: ROUTE, blocks: ["big-result", "on-compact"] },
      actions: BACK_TO_BED,
    },
  ],
};
