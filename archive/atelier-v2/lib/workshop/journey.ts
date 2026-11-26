import type { EventOrigin } from "./effects";
import type { WorkshopState } from "./state";

/** Ce que l'apprenant a déjà fait ou vu se produire, repéré dans le flux d'événements. */
export type Fact =
  | "answered_without_tool"
  | "custom_tool"
  | "key_denied"
  | "refund_done"
  | "sandbox_run"
  | "auto_denied"
  | "web_ok"
  | "web_blocked"
  | "mcp_ok"
  | "approved"
  | "refused"
  | "budget_paused"
  | "budget_raised"
  | "memory_written"
  | "memory_read"
  | "skill_loaded"
  | "delegated"
  | "outcome_done"
  | "entry_webhook"
  | "entry_cron"
  | "version_created"
  | "fault_recovered"
  | "terminated"
  | "interrupted";

export interface JourneyEvent {
  readonly name: string;
  readonly detail: string;
  readonly origin: EventOrigin;
  readonly isError: boolean;
}

export interface Journey {
  readonly facts: readonly Fact[];
  /** Le tour en cours a-t-il déjà appelé un outil ? */
  readonly turnUsedTool: boolean;
}

/** Les options qu'une mission fait apparaître dans l'interface. */
export type Feature = "evolve" | "entries" | "sandbox" | "budget" | "memory" | "advanced";

export interface Mission {
  readonly id: string;
  readonly title: string;
  /** Ce qu'il faut faire. */
  readonly todo: string;
  /** Ce qu'il faut remarquer en le faisant. */
  readonly notice: string;
  readonly unlocks: readonly Feature[];
  readonly isDone: (workshop: WorkshopState, facts: ReadonlySet<Fact>) => boolean;
}

export function createJourney(): Journey {
  return { facts: [], turnUsedTool: false };
}

/** Le début du résultat d'un outil de service tiers refusé faute de clé dans le vault. */
const KEY_DENIED = "Accès refusé";
/** Le début du résultat de `create_refund` quand le remboursement est parti. */
const REFUND_DONE = "Remboursement de";

function factsOf(event: JourneyEvent, turnUsedTool: boolean): Fact[] {
  const { name, detail, origin, isError } = event;
  switch (name) {
    case "agent.custom_tool_use":
      return ["custom_tool"];
    case "agent.tool_use":
      if (detail.includes("/mnt/memory")) return [detail.startsWith("write") ? "memory_written" : "memory_read"];
      return detail.includes("/workspace/skills") ? ["skill_loaded"] : [];
    case "agent.tool_result":
      if (detail.startsWith("Permission to use")) return ["auto_denied"];
      if (origin === "web") return [isError ? "web_blocked" : "web_ok"];
      return origin === "sandbox" && !isError ? ["sandbox_run"] : [];
    case "agent.mcp_tool_result":
      if (isError) return detail.startsWith(KEY_DENIED) ? ["key_denied"] : [];
      return detail.startsWith(REFUND_DONE) ? ["refund_done"] : ["mcp_ok"];
    case "user.tool_confirmation":
      return [detail === "allow" ? "approved" : "refused"];
    case "session.status_idle":
      if (detail.startsWith("budget_reached")) return ["budget_paused"];
      return detail.startsWith("end_turn") && !turnUsedTool ? ["answered_without_tool"] : [];
    case "session.updated":
      return ["budget_raised"];
    case "session.thread_created":
      return ["delegated"];
    case "span.outcome_evaluation_end":
      return detail.startsWith("satisfied") ? ["outcome_done"] : [];
    case "agents.update":
      return ["version_created"];
    case "session.status_rescheduled":
      return ["fault_recovered"];
    case "session.status_terminated":
      return ["terminated"];
    case "user.interrupt":
      return ["interrupted"];
    default:
      if (origin !== "entry") return [];
      if (name.includes("webhook")) return ["entry_webhook"];
      return name.includes("cron") ? ["entry_cron"] : [];
  }
}

const STARTS_TURN: ReadonlySet<string> = new Set(["user.message", "user.define_outcome"]);
const USES_TOOL: ReadonlySet<string> = new Set([
  "agent.custom_tool_use",
  "agent.tool_use",
  "agent.mcp_tool_use",
  "user.interrupt",
]);

/** Retient ce qu'un événement de session apprend sur le parcours de l'apprenant. */
export function recordEvent(journey: Journey, event: JourneyEvent): Journey {
  const fresh = factsOf(event, journey.turnUsedTool).filter((fact) => !journey.facts.includes(fact));
  const turnUsedTool = STARTS_TURN.has(event.name) ? false : journey.turnUsedTool || USES_TOOL.has(event.name);
  if (fresh.length === 0 && turnUsedTool === journey.turnUsedTool) return journey;
  return { facts: [...journey.facts, ...fresh], turnUsedTool };
}

/** Il suffit d'en avoir vu un pour terminer le parcours. */
const ADVANCED_FACTS: readonly Fact[] = [
  "delegated",
  "outcome_done",
  "mcp_ok",
  "skill_loaded",
  "web_ok",
  "auto_denied",
  "fault_recovered",
];

/** Le parcours : du plus simple au plus avancé, chaque mission s'appuyant sur les précédentes. */
export const MISSIONS: readonly Mission[] = [
  {
    id: "environment",
    title: "Monte la pièce",
    todo: "Crée l'environnement, en réseau isolé.",
    notice: "La boîte de support est déjà là, avec ses tickets, avant même que l'agent existe : c'est elle que ton agent devra gérer (en vrai, ton outil de support ou ta messagerie client). L'environnement, lui, n'est qu'un modèle de conteneur : la pièce de la session est encore vide.",
    unlocks: [],
    isDone: (workshop) => workshop.environment.id !== null,
  },
  {
    id: "vault",
    title: "Pose le coffre",
    todo: "Crée le vault sans y mettre de clé.",
    notice: "Le vault vit côté Anthropic, à part de l'agent. Il garde les identifiants des services tiers que l'agent appelle sans passer par toi.",
    unlocks: [],
    isDone: (workshop) => workshop.vault.id !== null,
  },
  {
    id: "tools",
    title: "Choisis ses outils",
    todo: "Garde la sélection proposée et valide.",
    notice: "Ce sont des outils « custom » : l'agent décidera de les appeler, mais c'est ton application qui les exécutera. Ils sont donc listés chez toi, dans le panneau « Ton application », pas dans la session, à côté de ta base de commandes.",
    unlocks: [],
    isDone: (workshop) => workshop.tools.isConfirmed,
  },
  {
    id: "agent",
    title: "Crée l'agent",
    todo: "Donne-lui un nom et crée-le.",
    notice: "Un agent est une configuration réutilisable : un modèle, des consignes, des outils. Il dort tant qu'aucune session ne tourne.",
    unlocks: [],
    isDone: (workshop) => workshop.agent.id !== null,
  },
  {
    id: "session",
    title: "Ouvre une session",
    todo: "Démarre la session.",
    notice: "La session, c'est l'exécution : elle réunit l'agent, l'environnement et le vault, et c'est elle qui produit le flux d'événements.",
    unlocks: [],
    isDone: (workshop) => workshop.session.count > 0,
  },
  {
    id: "question",
    title: "Pose-lui une question",
    todo: "Clique sur « Combien de tickets sont ouverts ? ».",
    notice: "Un tour peut se résumer à un message : aucun outil appelé, puis « idle » (end_turn). Regarde la pile à côté de l'agent : ta question et sa réponse viennent d'entrer dans sa fenêtre de contexte.",
    unlocks: [],
    isDone: (_workshop, facts) => facts.has("answered_without_tool"),
  },
  {
    id: "first_tool",
    title: "Fais-le agir",
    todo: "Clique sur « Réponds au ticket d'Alice » et suis le flux d'événements.",
    notice: "L'agent ne quitte pas la session : il émet agent.custom_tool_use, la session s'arrête (requires_action), l'appel sort de la pièce vers ton application, ton code agit sur la boîte de support, puis répond user.custom_tool_result. Chaque appel et chaque résultat s'empilent dans le contexte.",
    unlocks: [],
    isDone: (_workshop, facts) => facts.has("custom_tool"),
  },
  {
    id: "missing_key",
    title: "Change l'agent en route",
    todo: "Dans « Faire évoluer l'agent », ajoute l'outil « Remboursement » et enregistre. Ouvre une nouvelle session, puis, dans « Points d'entrée », clique sur « Un client demande un remboursement ».",
    notice: "Trois choses. La session en cours gardait l'ancienne version : il a fallu en ouvrir une nouvelle. La commande, c'est ton code qui l'a retrouvée dans ta base : lui seul y a accès. Le remboursement, lui, n'est pas à toi : il appartient au service Paiements, que la plateforme appelle elle-même (MCP). Sans identifiant dans le vault, l'appel s'arrête là.",
    // Les boutons de tickets sont dans « Points d'entrée » : ce panneau doit être visible dès cette mission.
    unlocks: ["evolve", "entries"],
    isDone: (_workshop, facts) => facts.has("key_denied"),
  },
  {
    id: "add_key",
    title: "Répare avec le vault",
    todo: "Dans le même panneau, ajoute la « Clé Paiements » au vault, puis clique sur « Traite les tickets en attente ». Le remboursement attend ton accord : approuve-le.",
    notice: "Ni nouvelle version ni nouvelle session : le vault est consulté au moment de l'appel. La plateforme joint l'identifiant en route ; ni l'agent ni ton application ne le voient. Et parce qu'un remboursement engage de l'argent, cet outil est en « always_ask » : la session s'arrête et t'attend avant chaque appel.",
    unlocks: ["evolve"],
    isDone: (_workshop, facts) => facts.has("refund_done"),
  },
  {
    id: "entries",
    title: "Laisse les clients le réveiller",
    todo: "Dans « Points d'entrée », allume l'interrupteur du webhook et laisse un ticket arriver tout seul. Puis allume celui du déploiement planifié (cron) et attends une relance.",
    notice: "Personne ne lui a parlé : le webhook part de la boîte de support vers ton application, et c'est elle qui envoie le message à la session. Le cron, lui, est un déploiement côté Anthropic : chaque échéance ouvre une nouvelle session, contexte vierge, pour reprendre les tickets restés sans réponse.",
    unlocks: ["entries"],
    isDone: (_workshop, facts) => facts.has("entry_webhook") && facts.has("entry_cron"),
  },
  {
    id: "sandbox",
    title: "Ouvre-lui le bac à sable",
    todo: "Fais évoluer l'agent : bac à sable « avec mon accord ». Ouvre une nouvelle session, demande « Fais le bilan du support », et autorise.",
    notice: "Ces outils-là tournent dans le conteneur, chez Anthropic : l'étiquette du flux dit « conteneur », pas « ton app ». Et la session t'attend avant chaque commande.",
    unlocks: ["sandbox"],
    isDone: (_workshop, facts) => facts.has("sandbox_run") && facts.has("approved"),
  },
  {
    id: "budget",
    title: "Plafonne la dépense",
    todo: "Ouvre une nouvelle session avec un budget de 10 ¢, fais-le travailler jusqu'à la pause, puis ajoute 10 ¢.",
    notice: "À la limite, la session ne s'arrête pas : elle se met en pause (budget_reached) et reprend dès que le plafond est relevé.",
    unlocks: ["budget"],
    isDone: (_workshop, facts) => facts.has("budget_paused") && facts.has("budget_raised"),
  },
  {
    id: "memory",
    title: "Donne-lui une mémoire",
    todo: "Nouvelle session avec un carnet de mémoire : demande « Réponds aux tickets en tutoyant ». Puis encore une nouvelle session : « Traite les tickets en attente ».",
    notice: "Une nouvelle session repart d'un contexte vide : elle oublie tout de la précédente. Seul le carnet survit, et il n'entre dans le contexte que quand l'agent le relit : c'est là qu'il retrouve le ton à employer avec les clients.",
    unlocks: ["memory"],
    isDone: (_workshop, facts) => facts.has("memory_written") && facts.has("memory_read"),
  },
  {
    id: "advanced",
    title: "Va plus loin",
    todo: "Tout est débloqué. Essaie au choix : déléguer (avec au moins trois tickets en attente, « Traite les tickets en attente »), un objectif noté, l'outil « Suivi colis » avec la « Clé Transporteur », un skill (« Traite les remboursements »), le web, la politique « auto », une panne.",
    notice: "Chacun ajoute une pièce à la scène et un type d'événement au flux. Le code affiché te montre l'appel correspondant.",
    unlocks: ["advanced"],
    isDone: (_workshop, facts) => ADVANCED_FACTS.some((fact) => facts.has(fact)),
  },
];

function firstOpenIndex(workshop: WorkshopState, journey: Journey): number {
  const facts = new Set(journey.facts);
  const index = MISSIONS.findIndex((mission) => !mission.isDone(workshop, facts));
  return index === -1 ? MISSIONS.length : index;
}

/** La première mission pas encore accomplie ; `null` quand le parcours est terminé. */
export function currentMission(workshop: WorkshopState, journey: Journey): Mission | null {
  return MISSIONS[firstOpenIndex(workshop, journey)] ?? null;
}

export function missionProgress(workshop: WorkshopState, journey: Journey): { done: number; total: number } {
  return { done: firstOpenIndex(workshop, journey), total: MISSIONS.length };
}

/** Une option apparaît dès que la mission qui l'introduit est atteinte, ou tout de suite en mode libre. */
export function isUnlocked(feature: Feature, workshop: WorkshopState, journey: Journey, isFreeMode: boolean): boolean {
  if (isFreeMode) return true;
  const reached = firstOpenIndex(workshop, journey);
  return MISSIONS.some((mission, index) => index <= reached && mission.unlocks.includes(feature));
}
