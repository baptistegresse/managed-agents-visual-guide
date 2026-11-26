import { toolSpec, type ReplyTone, type ToolId } from "./catalog";
import { ticketLabel, type Ticket } from "./desk";
import type { PlanStep } from "./planner";

/** Un tour reste borné : au-delà, l'agent s'arrête et le dit. */
export const MAX_CALLS_PER_TURN = 12;
const SKILL_PATH = "/workspace/skills/remboursement/SKILL.md";
const SKILL_TEXT = "Skill chargé : retrouver la commande, rembourser, puis prévenir le client.";

/** Ce dont l'agent dispose pour traiter un ticket. */
export interface HandlingContext {
  readonly enabledTools: readonly ToolId[];
  readonly hasSandbox?: boolean;
  /** A-t-il le skill « remboursement » ? Il le charge avant de traiter une demande de remboursement. */
  readonly hasSkill?: boolean;
  /** Le ton demandé ou retenu ; sans mention, la réponse garde le ton par défaut de l'outil. */
  readonly tone?: ReplyTone | null;
}

type Call = Extract<PlanStep, { type: "call" }>;

/** Le travail sur un ticket : d'abord se renseigner, ensuite répondre. */
interface Work {
  readonly ticket: Ticket;
  readonly research: readonly PlanStep[];
  readonly response: readonly PlanStep[];
}

export function say(text: string): PlanStep {
  return { type: "say", text };
}

export function missingTool(tool: ToolId): PlanStep {
  return say(`Je n'ai pas l'outil « ${toolSpec(tool).label} » : il n'est pas dans ma liste.`);
}

function call(tool: ToolId, ticket: Ticket, dependsOn?: ToolId): Call {
  return { type: "call", tool, input: { ticket: ticket.id }, ...(dependsOn ? { dependsOn } : {}) };
}

function reply(ticket: Ticket, context: HandlingContext, dependsOn?: ToolId): Call {
  const answer = call("reply_ticket", ticket, dependsOn);
  return context.tone ? { ...answer, input: { ...answer.input, tone: context.tone } } : answer;
}

function canRefund(ticket: Ticket, context: HandlingContext): boolean {
  return ticket.isRefunded || context.enabledTools.includes("create_refund");
}

/** Les outils custom sans lesquels le ticket ne peut pas être traité. */
function neededTools(ticket: Ticket, context: HandlingContext): ToolId[] {
  const lookup: ToolId[] = ticket.isOrderKnown ? [] : ["lookup_order"];
  switch (ticket.kind) {
    case "question":
      return ["reply_ticket"];
    case "spam":
      return ["close_ticket"];
    case "delivery":
      return [...lookup, "reply_ticket"];
    case "refund":
      if (ticket.isRefunded) return ["reply_ticket"];
      return canRefund(ticket, context) ? [...lookup, "reply_ticket"] : lookup;
  }
}

/** Sans outil de remboursement, il ne promet rien au client : il passe la main à un humain. */
function handOver(ticket: Ticket, lookup: readonly PlanStep[], context: HandlingContext): Work {
  const canEscalate = context.enabledTools.includes("escalate_ticket");
  const what = canEscalate ? "je transmets son ticket à l'équipe" : "je laisse son ticket ouvert";
  return {
    ticket,
    research: [...lookup, say(`Je n'ai pas d'outil pour rembourser ${ticket.customer} : ${what}.`)],
    response: canEscalate ? [call("escalate_ticket", ticket)] : [],
  };
}

function workFor(ticket: Ticket, context: HandlingContext): Work {
  const lookup = ticket.isOrderKnown ? [] : [call("lookup_order", ticket)];
  switch (ticket.kind) {
    case "question":
      return { ticket, research: [], response: [reply(ticket, context)] };
    case "spam":
      return { ticket, research: [], response: [call("close_ticket", ticket)] };
    case "delivery": {
      // Le suivi du colis est un plus : il ne le demande que si le service Transporteur est branché.
      const canTrack = context.enabledTools.includes("track_parcel") && !ticket.isTracked;
      return {
        ticket,
        research: [...lookup, ...(canTrack ? [call("track_parcel", ticket)] : [])],
        response: [reply(ticket, context)],
      };
    }
    case "refund":
      if (ticket.isRefunded) return { ticket, research: [], response: [reply(ticket, context)] };
      if (!canRefund(ticket, context)) return handOver(ticket, lookup, context);
      return {
        ticket,
        research: [...lookup, call("create_refund", ticket)],
        // Pas de « c'est remboursé » au client si le remboursement n'est pas parti.
        response: [reply(ticket, context, "create_refund")],
      };
  }
}

function countCalls(steps: readonly PlanStep[]): number {
  return steps.filter((step) => step.type === "call").length;
}

/** Garde les tickets, dans l'ordre, tant que le tour reste sous son plafond d'appels. */
function withinBudget(works: readonly Work[]): Work[] {
  return works.reduce<{ kept: Work[]; calls: number; isFull: boolean }>(
    (state, work) => {
      const calls = state.calls + countCalls(work.research) + countCalls(work.response);
      if (state.isFull || calls > MAX_CALLS_PER_TURN) return { ...state, isFull: true };
      return { kept: [...state.kept, work], calls, isFull: false };
    },
    { kept: [], calls: 0, isFull: false },
  ).kept;
}

/** Un skill n'entre dans le contexte que quand la tâche le demande : ici, avant le premier remboursement. */
function withSkill(works: readonly Work[], context: HandlingContext): Work[] {
  if (!context.hasSkill || !context.hasSandbox) return [...works];
  const first = works.find((work) => work.ticket.kind === "refund" && !work.ticket.isRefunded);
  const load: PlanStep[] = [
    say("Je charge mon skill de remboursement."),
    { type: "sandbox", tool: "read", target: SKILL_PATH, output: SKILL_TEXT, place: "library" },
  ];
  return works.map((work) => (work === first ? { ...work, research: [...load, ...work.research] } : work));
}

function intro(tickets: readonly Ticket[], canAct: boolean): PlanStep {
  if (tickets.length === 1) return say(`Je regarde ${ticketLabel(tickets[0])}.`);
  return say(`${tickets.length} tickets en attente${canAct ? " : je m'en occupe." : "."}`);
}

/**
 * Traite des tickets : il se renseigne d'abord (commande, colis, remboursement),
 * puis répond à chacun. Un ticket dont un outil manque est laissé de côté, et
 * l'agent dit quel outil lui manque, une fois par outil.
 */
export function handleTickets(tickets: readonly Ticket[], context: HandlingContext): PlanStep[] {
  if (tickets.length === 0) return [say("Aucun ticket n'attend de réponse.")];
  const lacking = (ticket: Ticket): ToolId[] =>
    neededTools(ticket, context).filter((tool) => !context.enabledTools.includes(tool));
  const doable = tickets.filter((ticket) => lacking(ticket).length === 0).map((ticket) => workFor(ticket, context));
  const works = withSkill(withinBudget(doable), context);
  const research = works.flatMap((work) => work.research);
  const response = works.flatMap((work) => work.response);
  const hasCalls = countCalls([...research, ...response]) > 0;

  const bridge = works.length > 1 && research.length > 0 && response.length > 0;
  const complaints = [...new Set(tickets.flatMap(lacking))].map(missingTool);
  const overflow = works.length < doable.length ? [say("Je m'arrête là pour ce tour : il reste des tickets en attente.")] : [];
  const outro: PlanStep[] = hasCalls
    ? [
        { type: "say", text: "C'est réglé.", when: "granted" },
        { type: "say", text: "Je n'ai pas pu tout régler : il me manque un accès dans le vault.", when: "denied" },
      ]
    : [];

  return [
    intro(tickets, hasCalls),
    ...research,
    ...(bridge ? [say("J'ai ce qu'il me faut : je réponds à chacun.")] : []),
    ...response,
    ...complaints,
    ...overflow,
    ...outro,
  ];
}
