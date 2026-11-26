import { toolSpec } from "./catalog";
import { INCIDENT_KINDS, openTickets, type Desk, type TicketKind } from "./desk";
import type { PlanContext, PlanStep } from "./planner";

/** Un verbe qui demande de faire quelque chose : « peux-tu répondre… ? » reste une consigne. */
const ACTION =
  /\b(?:repond[sz]?|repondre|traite[rsz]?|ferme[rsz]?|cloture[rsz]?|supprime[rsz]?|rembourse[rsz]?|transmets?|transmettre|escalade[rsz]?|occupe[rsz]?|relance[rsz]?|fais|faire|installe[rsz]?|vide[rsz]?|cherche[rsz]?|lis|lire|ouvre|ouvrir|tutoie|vouvoie)\b/;
const QUESTION_OPENER = /^(?:combien|quels?|quelles?|est-ce|pourquoi|comment|qui|que|qu'|ou|as-tu|sais-tu|peux-tu|y a-t-il|de quoi)\b/;
const GREETING = /^(?:bonjour|bonsoir|salut|coucou|hello)\b/;
const THANKS = /\bmerci\b/;
const ABILITIES = /\boutils?\b|peux-tu faire|sais-tu faire|capable/;
const IDENTITY = /qui es-tu|t'appelles|ton nom/;
const MEMORY = /souviens|memoire|\bnotes?\b|retenu/;
const STATE = /\b(?:combien|contient|etat|decris|file|attente|tickets?|clients?)\b|y a-t-il|qu'y a|comment va|quoi de neuf/;

/** Le nom de chaque type de ticket, au singulier puis au pluriel. */
const KIND_NAMES: Readonly<Record<TicketKind, readonly [one: string, many: string]>> = {
  question: ["question", "questions"],
  delivery: ["colis non reçu", "colis non reçus"],
  refund: ["demande de remboursement", "demandes de remboursement"],
  spam: ["message indésirable", "messages indésirables"],
};

function say(text: string): PlanStep[] {
  return [{ type: "say", text }];
}

function countLabel(kind: TicketKind, count: number): string {
  const [one, many] = KIND_NAMES[kind];
  return `${count} ${count > 1 ? many : one}`;
}

/** La file d'attente, telle que l'agent la lit dans son contexte : combien de tickets, et de quels types. */
function describeQueue(desk: Desk): string {
  const open = openTickets(desk);
  if (open.length === 0) return "Aucun ticket n'est ouvert : la file est vide.";
  const kinds = INCIDENT_KINDS.flatMap((kind) => {
    const count = open.filter((ticket) => ticket.kind === kind).length;
    return count === 0 ? [] : [countLabel(kind, count)];
  });
  const total = open.length > 1 ? `${open.length} tickets sont ouverts` : "1 ticket est ouvert";
  return `${total} : ${kinds.join(", ")}.`;
}

function describeHandedOver(desk: Desk): string {
  const count = desk.tickets.filter((ticket) => ticket.status === "escalated").length;
  if (count === 0) return "";
  return count > 1
    ? ` ${count} tickets transmis à l'équipe attendent un humain.`
    : " 1 ticket transmis à l'équipe attend un humain.";
}

function describeAbilities(context: PlanContext): string {
  const labels = context.enabledTools.map((tool) => toolSpec(tool).label);
  const extras = [
    ...(context.hasSandbox ? ["un bac à sable pour lancer des commandes et écrire des fichiers"] : []),
    ...(context.hasWeb ? ["la recherche web"] : []),
    ...(context.hasSkill ? ["un skill pour les remboursements"] : []),
  ];
  const tools = `J'ai ${labels.length} outil${labels.length > 1 ? "s" : ""} pour le support : ${labels.join(", ")}.`;
  return extras.length === 0 ? tools : `${tools} J'ai aussi ${extras.join(", ")}.`;
}

function describeMemory(memory: readonly string[] | null | undefined): string {
  if (!memory) return "Je n'ai pas de carnet de mémoire dans cette session : j'oublierai tout à la suivante.";
  return memory.length === 0 ? "Mon carnet est encore vide." : `Dans mon carnet : ${memory.join(" ; ")}.`;
}

/**
 * Une question ou un mot aimable appelle une réponse, pas une action : le tour
 * se résume alors à un message de l'agent, sans aucun appel d'outil. `null` si
 * le texte est une consigne.
 */
export function converse(text: string, context: PlanContext): PlanStep[] | null {
  const asksToAct = ACTION.test(text);
  if (GREETING.test(text) && !asksToAct) {
    return say("Bonjour ! Pose-moi une question sur la file de tickets, ou donne-moi une consigne.");
  }
  if (THANKS.test(text) && !asksToAct) return say("Avec plaisir.");

  const isQuestion = text.includes("?") || QUESTION_OPENER.test(text);
  if (!isQuestion) return null;
  if (ABILITIES.test(text)) return say(describeAbilities(context));
  if (asksToAct) return null;
  if (IDENTITY.test(text)) return say("Je suis l'assistant du support : un agent simulé, qui suit un script.");
  if (MEMORY.test(text)) return say(describeMemory(context.memory));
  if (STATE.test(text)) return say(`${describeQueue(context.desk)}${describeHandedOver(context.desk)}`);
  return say(
    "Je ne sais pas répondre à ça : je suis un agent simulé. Je peux te dire où en est la file de tickets, ce que je sais faire, ou exécuter une consigne.",
  );
}
