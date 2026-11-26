import { z } from "zod";
import { keySpec, REPLY_TONES, toolSpec, type KeyId, type ReplyTone, type ToolId } from "./catalog";

/** La boîte de support est une planche de DESK_SIZE × DESK_SIZE emplacements : un ticket par emplacement. */
export const DESK_SIZE = 6;

export type TicketKind = "question" | "delivery" | "refund" | "spam";
export type TicketStatus = "open" | "resolved" | "escalated";

export interface Ticket {
  readonly id: number;
  /** Son emplacement sur la planche. */
  readonly x: number;
  readonly y: number;
  readonly kind: TicketKind;
  readonly status: TicketStatus;
  readonly customer: string;
  /** Ce que le client a écrit. */
  readonly subject: string;
  /** Montant de la commande, en euros ; `null` quand aucune commande n'est en jeu. */
  readonly amount: number | null;
  /** La commande a été retrouvée dans la base de ton application. */
  readonly isOrderKnown: boolean;
  /** Le transporteur a dit où se trouve le colis. */
  readonly isTracked: boolean;
  readonly isRefunded: boolean;
}

export interface Desk {
  /** Les tickets, dans leur ordre d'arrivée. */
  readonly tickets: readonly Ticket[];
  readonly nextId: number;
}

/** L'entrée d'un outil : `ticket` est le numéro du ticket visé. */
export interface ToolInput {
  readonly ticket: number;
  readonly tone?: ReplyTone;
}

/** Un appel d'outil tel que l'agent l'émet. */
export interface ToolRequest {
  readonly tool: ToolId;
  readonly input: ToolInput;
}

export interface ToolResult {
  readonly text: string;
  readonly isError: boolean;
}

export interface Applied {
  readonly desk: Desk;
  readonly result: ToolResult;
}

/** Un ticket qui arrive sans que personne, chez toi, n'ait rien demandé. */
export interface Incident {
  readonly kind: TicketKind;
  readonly customer: string;
  readonly subject: string;
  readonly amount: number | null;
}

export type IncidentKind = TicketKind;
export const INCIDENT_KINDS: readonly IncidentKind[] = ["question", "delivery", "refund", "spam"];

const CUSTOMERS: readonly string[] = [
  "Alice",
  "Bruno",
  "Chloé",
  "David",
  "Emma",
  "Farid",
  "Inès",
  "Julien",
  "Léa",
  "Malik",
  "Nina",
  "Omar",
];
const SPAM_SENDERS: readonly string[] = ["Promo Flash", "Loterie Express", "Crypto Bonus"];

const SUBJECTS: Readonly<Record<TicketKind, readonly string[]>> = {
  question: [
    "Comment changer mon mot de passe ?",
    "Puis-je modifier mon adresse de livraison ?",
    "Quels sont vos délais de livraison ?",
    "Comment télécharger ma facture ?",
  ],
  delivery: [
    "Je n'ai pas reçu ma commande.",
    "Mon colis devait arriver lundi, toujours rien.",
    "Le suivi de mon colis ne bouge plus.",
  ],
  refund: [
    "Je veux être remboursé : l'article est arrivé cassé.",
    "L'article ne correspond pas à la photo, remboursez-moi.",
    "J'ai été débité deux fois, je demande un remboursement.",
  ],
  spam: [
    "Gagnez un téléphone en cliquant ici !",
    "Offre exclusive : doublez vos gains aujourd'hui.",
    "Vous avez été tiré au sort, répondez vite.",
  ],
};

/** Les montants de commande possibles, en euros. */
const AMOUNTS: readonly number[] = [19, 39, 59, 89];
/** Les tickets dont une commande est l'objet. */
const ORDER_KINDS: ReadonlySet<TicketKind> = new Set(["delivery", "refund"]);

const SEED: readonly Incident[] = [
  { kind: "question", customer: "Alice", subject: "Comment changer mon mot de passe ?", amount: null },
  { kind: "delivery", customer: "Bruno", subject: "Je n'ai pas reçu ma commande.", amount: 39 },
  { kind: "question", customer: "Chloé", subject: "Puis-je modifier mon adresse de livraison ?", amount: null },
];

const toolInput = z.object({ ticket: z.number().int().min(1), tone: z.enum(REPLY_TONES).optional() });

const ELIDED = /^[aeiouhàâäéèêëîïôöùûü]/i;

/** « d'Alice », « de Bruno » : la préposition s'élide devant une voyelle. */
function of(name: string): string {
  return ELIDED.test(name) ? `d'${name}` : `de ${name}`;
}

/** Le ticket tel qu'on le désigne dans une phrase : « le ticket d'Alice ». */
export function ticketLabel(ticket: Ticket): string {
  return `le ticket ${of(ticket.customer)}`;
}

export function ticketById(desk: Desk, id: number): Ticket | undefined {
  return desk.tickets.find((ticket) => ticket.id === id);
}

/** Les tickets qui attendent encore une réponse, du plus ancien au plus récent. */
export function openTickets(desk: Desk): Ticket[] {
  return desk.tickets.filter((ticket) => ticket.status === "open");
}

interface Slot {
  readonly x: number;
  readonly y: number;
}

/** Le premier emplacement libre, ligne par ligne. */
function firstFreeSlot(desk: Desk): Slot | null {
  const slots = Array.from({ length: DESK_SIZE * DESK_SIZE }, (_, index) => ({
    x: index % DESK_SIZE,
    y: Math.floor(index / DESK_SIZE),
  }));
  return slots.find((slot) => !desk.tickets.some((ticket) => ticket.x === slot.x && ticket.y === slot.y)) ?? null;
}

/** Planche pleine : le plus ancien ticket déjà traité cède sa place. Sans effet s'il reste de la place. */
function withRoom(desk: Desk): Desk {
  if (firstFreeSlot(desk)) return desk;
  const oldest = desk.tickets.find((ticket) => ticket.status !== "open");
  return oldest ? { ...desk, tickets: desk.tickets.filter((ticket) => ticket !== oldest) } : desk;
}

/** Fait arriver le ticket. Sans effet si toute la planche est occupée par des tickets ouverts. */
export function applyIncident(desk: Desk, incident: Incident): Desk {
  const roomy = withRoom(desk);
  const slot = firstFreeSlot(roomy);
  if (!slot) return desk;
  const ticket: Ticket = {
    id: roomy.nextId,
    ...slot,
    ...incident,
    status: "open",
    isOrderKnown: false,
    isTracked: false,
    isRefunded: false,
  };
  return { tickets: [...roomy.tickets, ticket], nextId: roomy.nextId + 1 };
}

/** Au départ, trois clients attendent déjà : la boîte de support existait avant l'agent. */
export function createDesk(): Desk {
  return SEED.reduce(applyIncident, { tickets: [], nextId: 1 });
}

function pickOne<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

/** Un client qui n'a pas déjà un ticket sur la planche, tant qu'il en reste un. */
function pickCustomer(desk: Desk, kind: TicketKind, random: () => number): string {
  const pool = kind === "spam" ? SPAM_SENDERS : CUSTOMERS;
  const fresh = pool.filter((name) => !desk.tickets.some((ticket) => ticket.customer === name));
  return pickOne(fresh.length > 0 ? fresh : pool, random);
}

/**
 * Tire le prochain ticket : d'un type imposé, ou au hasard. `null` si la planche
 * est pleine de tickets ouverts, donc qu'aucun ne peut arriver.
 */
export function pickIncident(desk: Desk, random: () => number, kind?: IncidentKind): Incident | null {
  if (!firstFreeSlot(withRoom(desk))) return null;
  const drawn = kind ?? pickOne(INCIDENT_KINDS, random);
  return {
    kind: drawn,
    customer: pickCustomer(desk, drawn, random),
    subject: pickOne(SUBJECTS[drawn], random),
    amount: ORDER_KINDS.has(drawn) ? pickOne(AMOUNTS, random) : null,
  };
}

/** Ce que la boîte de support signale : c'est le texte qui arrive par un point d'entrée. */
export function describeIncident(incident: Incident): string {
  if (incident.kind === "spam") return `Un message indésirable arrive : « ${incident.subject} »`;
  return `Nouveau ticket ${of(incident.customer)} : « ${incident.subject} »`;
}

function refuse(desk: Desk, text: string): Applied {
  return { desk, result: { text, isError: true } };
}

function done(desk: Desk, text: string): Applied {
  return { desk, result: { text, isError: false } };
}

function update(desk: Desk, ticket: Ticket, changes: Partial<Ticket>): Desk {
  return { ...desk, tickets: desk.tickets.map((each) => (each === ticket ? { ...each, ...changes } : each)) };
}

function lookupOrder(desk: Desk, ticket: Ticket): Applied {
  if (ticket.amount === null) return refuse(desk, "Ce ticket ne concerne aucune commande.");
  const state = ticket.kind === "delivery" ? "expédiée, pas encore livrée" : "livrée";
  return done(update(desk, ticket, { isOrderKnown: true }), `Commande ${of(ticket.customer)} : ${ticket.amount} €, ${state}.`);
}

function trackParcel(desk: Desk, ticket: Ticket): Applied {
  if (ticket.kind !== "delivery") return refuse(desk, "Ce ticket ne concerne aucun colis en route.");
  return done(update(desk, ticket, { isTracked: true }), `Colis ${of(ticket.customer)} : bloqué au dépôt depuis trois jours.`);
}

function createRefund(desk: Desk, ticket: Ticket): Applied {
  if (!ticket.isOrderKnown) return refuse(desk, "Commande inconnue : cherche-la d'abord.");
  if (ticket.isRefunded) return refuse(desk, "Cette commande est déjà remboursée.");
  return done(update(desk, ticket, { isRefunded: true }), `Remboursement de ${ticket.amount} € émis pour ${ticket.customer}.`);
}

function replyTicket(desk: Desk, ticket: Ticket, tone: ReplyTone | undefined): Applied {
  if (ticket.status === "resolved") return refuse(desk, "Ce ticket est déjà résolu.");
  const manner = tone === "tu" ? ", avec le tutoiement" : "";
  return done(update(desk, ticket, { status: "resolved" }), `Réponse envoyée à ${ticket.customer}${manner}.`);
}

function closeTicket(desk: Desk, ticket: Ticket): Applied {
  if (ticket.kind !== "spam") return refuse(desk, "Ce ticket vient d'un vrai client : réponds-lui plutôt.");
  return done({ ...desk, tickets: desk.tickets.filter((each) => each !== ticket) }, "Ticket indésirable fermé.");
}

function escalateTicket(desk: Desk, ticket: Ticket): Applied {
  if (ticket.status !== "open") return refuse(desk, "Ce ticket n'attend plus de réponse.");
  return done(update(desk, ticket, { status: "escalated" }), `Ticket ${of(ticket.customer)} transmis à l'équipe.`);
}

/**
 * Exécute un outil : c'est le rôle de ton application ou du service tiers, jamais
 * de l'agent. Un outil d'un service tiers est refusé si sa clé n'est pas dans le vault.
 */
export function applyTool(desk: Desk, request: ToolRequest, keys: readonly KeyId[]): Applied {
  const spec = toolSpec(request.tool);
  if (spec.requiresKey && !keys.includes(spec.requiresKey)) {
    return refuse(desk, `Accès refusé : la « ${keySpec(spec.requiresKey).label} » n'est pas dans le vault.`);
  }
  const parsed = toolInput.safeParse(request.input);
  if (!parsed.success) return refuse(desk, "Paramètres invalides : « ticket » doit être le numéro d'un ticket.");
  const ticket = ticketById(desk, parsed.data.ticket);
  if (!ticket) return refuse(desk, "Aucun ticket ne porte ce numéro.");

  switch (request.tool) {
    case "lookup_order":
      return lookupOrder(desk, ticket);
    case "track_parcel":
      return trackParcel(desk, ticket);
    case "create_refund":
      return createRefund(desk, ticket);
    case "reply_ticket":
      return replyTicket(desk, ticket, parsed.data.tone);
    case "close_ticket":
      return closeTicket(desk, ticket);
    case "escalate_ticket":
      return escalateTicket(desk, ticket);
  }
}
