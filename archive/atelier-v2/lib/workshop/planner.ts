import type { ReplyTone, ToolId } from "./catalog";
import { converse } from "./conversation";
import { openTickets, ticketLabel, type Desk, type Ticket, type TicketKind, type ToolInput } from "./desk";
import { handleTickets, say, type HandlingContext } from "./handling";
import { specialPlan } from "./requests";

export type { ToolInput } from "./desk";

export type PlanStep =
  | {
      readonly type: "say";
      readonly text: string;
      /**
       * Une phrase de bilan dépend de ce qui s'est passé : « granted » ne se dit que
       * si aucun outil n'a été refusé faute de clé pendant le tour, « denied » que si l'un l'a été.
       */
      readonly when?: "granted" | "denied";
    }
  | {
      readonly type: "call";
      readonly tool: ToolId;
      readonly input: ToolInput;
      /** Cet appel n'a de sens que si celui-là a abouti : il est sauté si l'outil a été refusé. */
      readonly dependsOn?: ToolId;
    }
  /** Un outil intégré, exécuté dans le conteneur : bash ou un outil de fichier. */
  | {
      readonly type: "sandbox";
      readonly tool: "bash" | "write" | "read";
      readonly target: string;
      readonly output: string;
      /** Nom du fichier produit, s'il y en a un. */
      readonly file?: string;
      /** Où l'agent se tient : à l'établi par défaut, ou devant sa bibliothèque de skills. */
      readonly place?: "library";
      /** Ce qu'en penserait la politique « auto » : sans mention, l'appel est jugé sûr. */
      readonly risk?: "high" | "unclear";
    }
  /** Un outil web : il s'exécute sur les serveurs d'Anthropic, limité aux domaines autorisés. */
  | {
      readonly type: "web";
      readonly tool: "web_search" | "web_fetch";
      readonly target: string;
      readonly output: string;
      readonly isError: boolean;
    }
  /** Lecture ou écriture du carnet de mémoire, qui survit d'une session à l'autre. */
  | { readonly type: "memory"; readonly op: "read" }
  | { readonly type: "memory"; readonly op: "write"; readonly note: string };

export interface PlanContext {
  readonly enabledTools: readonly ToolId[];
  readonly desk: Desk;
  readonly random: () => number;
  /** L'agent a-t-il les outils du bac à sable (bash, fichiers) ? */
  readonly hasSandbox?: boolean;
  /** Les notes du carnet de mémoire, s'il en a un ; `null` sans mémoire. */
  readonly memory?: readonly string[] | null;
  /** Premier tour de la session : c'est là qu'il relit ses notes. */
  readonly isFirstTurn?: boolean;
  /** A-t-il le skill « remboursement » ? */
  readonly hasSkill?: boolean;
  /** La FAQ est-elle montée comme fichier dans son conteneur ? */
  readonly hasPlan?: boolean;
  /** A-t-il les outils web, et le réseau de son environnement est-il ouvert ? */
  readonly hasWeb?: boolean;
  readonly isNetworkOpen?: boolean;
}

const TONE_NOTE = "Ton préféré : ";
const TONE_NAMES: Readonly<Record<ReplyTone, string>> = { tu: "tutoiement", vous: "vouvoiement" };
const TONE_REQUESTS: ReadonlyArray<readonly [ReplyTone, RegExp]> = [
  ["tu", /\btuto(?:i|y)\w*/],
  ["vous", /\bvouvo(?:i|y)\w*/],
];

/** Un verbe qui demande de s'occuper des tickets. */
const HANDLE_REQUEST =
  /\b(?:trait\w*|occupe\w*|gere[rsz]?|regl\w*|repond\w*|relance\w*|ferme\w*|clotur\w*|supprim\w*|rembours\w*|transmet\w*)\b/;
/** Les mots (sans accents) qui restreignent la consigne à un type de ticket. */
const KIND_WORDS: ReadonlyArray<readonly [TicketKind, RegExp]> = [
  ["refund", /\brembours\w*/],
  ["delivery", /\b(?:colis|livraisons?)\b/],
  ["question", /\bquestions?\b/],
  ["spam", /\b(?:indesirables?|spams?)\b/],
];
const TICKET_NUMBER = /\bticket (?:n[°o]? ?|# ?)?(\d+)\b/;
const TICKET_OWNER = /\bticket (?:de |d')(?!(?:la|le|un|une)\b)([a-z-]+)/;
/** Le même nom, relevé dans la consigne telle qu'elle a été écrite, pour le redire avec ses accents. */
const WRITTEN_OWNER = /ticket (?:de |d['’])([\p{L}-]+)/iu;

const FALLBACK =
  "Je n'ai pas compris de consigne. Dis-moi quel ticket traiter, ou pose-moi une question sur la file de tickets.";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/’/g, "'");
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function requestedTone(text: string): ReplyTone | null {
  return TONE_REQUESTS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** Le ton noté dans le carnet lors d'une session précédente, s'il y en a un. */
export function rememberedTone(memory: readonly string[] | null | undefined): ReplyTone | null {
  const note = memory?.find((each) => each.startsWith(TONE_NOTE));
  const found = TONE_REQUESTS.find(([tone]) => note === `${TONE_NOTE}${TONE_NAMES[tone]}`);
  return found?.[0] ?? null;
}

/** En début de session, l'agent relit son carnet : c'est le seul moyen pour lui de se souvenir. */
export function recallSteps(memory: readonly string[] | null | undefined, isFirstTurn: boolean): PlanStep[] {
  if (!memory || memory.length === 0 || !isFirstTurn) return [];
  return [{ type: "memory", op: "read" }, say(`J'ai relu mes notes. ${memory.join(" ; ")}.`)];
}

type Target =
  | { readonly ticket: Ticket }
  /** La consigne nomme un client qui n'a aucun ticket. */
  | { readonly stranger: string };

/** Le ticket que la consigne désigne, par le nom du client ou par son numéro. */
function namedTicket(text: string, task: string, desk: Desk): Target | null {
  const byName = desk.tickets.filter((ticket) => new RegExp(`\\b${normalize(ticket.customer)}\\b`).test(text));
  const numbered = TICKET_NUMBER.exec(text);
  const byNumber = numbered ? desk.tickets.filter((ticket) => ticket.id === Number(numbered[1])) : [];
  const found = [...byName, ...byNumber];
  if (found.length > 0) return { ticket: found.find((ticket) => ticket.status === "open") ?? found[0] };
  if (numbered) return { stranger: `numéro ${numbered[1]}` };
  const owner = TICKET_OWNER.exec(text);
  const isKind = owner ? KIND_WORDS.some(([, pattern]) => pattern.test(owner[1])) : false;
  if (!owner || isKind) return null;
  return { stranger: `au nom de ${capitalize(WRITTEN_OWNER.exec(task)?.[1] ?? owner[1])}` };
}

function handleNamed(target: Target, handling: HandlingContext): PlanStep[] {
  if ("stranger" in target) return [say(`Je ne trouve aucun ticket ${target.stranger}.`)];
  const { ticket } = target;
  if (ticket.status === "open") return handleTickets([ticket], handling);
  const state = ticket.status === "resolved" ? "déjà résolu" : "déjà entre les mains de l'équipe";
  return [say(`${capitalize(ticketLabel(ticket))} est ${state}.`)];
}

function hasReply(steps: readonly PlanStep[]): boolean {
  return steps.some((step) => step.type === "call" && step.tool === "reply_ticket");
}

/** Une consigne qui porte sur les tickets : un seul, nommé, ou tous ceux qui attendent. `null` sinon. */
function ticketPlan(text: string, task: string, context: PlanContext): PlanStep[] | null {
  const asked = requestedTone(text);
  const remembered = rememberedTone(context.memory);
  const handling: HandlingContext = {
    enabledTools: context.enabledTools,
    hasSandbox: context.hasSandbox,
    hasSkill: context.hasSkill,
    tone: asked ?? remembered,
  };
  const target = namedTicket(text, task, context.desk);
  if (!target && !asked && !HANDLE_REQUEST.test(text)) return null;

  const kind = KIND_WORDS.find(([, pattern]) => pattern.test(text))?.[0];
  const work = target
    ? handleNamed(target, handling)
    : handleTickets(
        openTickets(context.desk).filter((ticket) => !kind || ticket.kind === kind),
        handling,
      );
  // Une préférence nouvelle est notée dans le carnet, pour les sessions suivantes.
  const learn: PlanStep[] =
    context.memory && asked && asked !== remembered
      ? [{ type: "memory", op: "write", note: `${TONE_NOTE}${TONE_NAMES[asked]}` }]
      : [];
  const habit: PlanStep[] =
    !asked && remembered && hasReply(work)
      ? [say(`Je me souviens que tu préfères le ${TONE_NAMES[remembered]} : je garde ce ton.`)]
      : [];
  return [...learn, ...habit, ...work];
}

/**
 * Le « cerveau » de l'agent simulé : il lit la consigne et décide des appels
 * d'outils. Dans une vraie session, c'est Claude qui prend ces décisions.
 */
export function planTurn(task: string, context: PlanContext): PlanStep[] {
  const text = normalize(task);
  // Sans consigne reconnaissable, il n'agit pas : il le dit, plutôt que d'improviser.
  const plan =
    specialPlan(text, context) ?? converse(text, context) ?? ticketPlan(text, task, context) ?? [say(FALLBACK)];
  return [...recallSteps(context.memory, context.isFirstTurn ?? false), ...plan];
}

export interface ReactionContext extends HandlingContext {
  /** Une relance programmée (cron) plutôt qu'un ticket qui vient d'arriver. */
  readonly isRound: boolean;
}

/**
 * Ce que fait l'agent simulé quand un point d'entrée le réveille : il traite le
 * ticket qui vient d'arriver, ou, pour une relance, tous ceux restés sans réponse.
 */
export function planReaction(tickets: readonly Ticket[], context: ReactionContext): PlanStep[] {
  if (context.isRound && tickets.length === 0) {
    return [say("Relance terminée : aucun ticket n'attend de réponse, je retourne dormir.")];
  }
  return handleTickets(tickets, context);
}
