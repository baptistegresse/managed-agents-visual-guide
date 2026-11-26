import { openTickets, type Desk } from "./desk";
import { MAX_CALLS_PER_TURN, missingTool, say } from "./handling";
import type { PlanContext, PlanStep } from "./planner";

/** Le fichier monté dans le conteneur au démarrage de la session : la FAQ du support. */
export const PLAN_FILE = "faq.md";
const PLAN_TEXT =
  "Mot de passe : lien « Mot de passe oublié » sur la page de connexion. Adresse de livraison : modifiable tant que la commande n'est pas expédiée.";
const PLAN_REQUEST = /\bfaq\b/;

/** Le seul site que les outils web ont le droit de consulter. */
export const ALLOWED_DOMAIN = "transporteur.example";
const SEARCH_REQUEST = /\b(?:cherche\w*|recherche\w*)\b.*\b(?:web|internet|en ligne)\b/;
const FETCH_REQUEST = /\b(?:lis|ouvre)\b.*?\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)/;
const SEARCH_QUERY = "statut des livraisons du transporteur";
const CARRIER_STATUS = "Retards de deux à trois jours sur les livraisons cette semaine.";

/** Une commande qui efface des fichiers : il faut qu'elle vise le dossier, pas des tickets. */
const WIPE_REQUEST = /\b(?:vide|efface|supprime)\b.*\b(?:dossier|repertoire|workspace|fichiers?)\b/;
const INSTALL_REQUEST = /\binstalle\w*\b/;

/** Une consigne qui demande un document : elle passe par le bac à sable. */
const REPORT_REQUEST = /\b(?:export\w*|rapport|bilan|compte[- ]rendu)\b/;
const REPORT_SCRIPT = "bilan_support.py";
const REPORT_FILE = "bilan_support.md";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

function summary(desk: Desk): string {
  const count = (status: string): number => desk.tickets.filter((ticket) => ticket.status === status).length;
  return [
    plural(count("open"), "ticket ouvert", "tickets ouverts"),
    plural(count("resolved"), "résolu", "résolus"),
    `${count("escalated")} transmis à l'équipe`,
  ].join(", ");
}

/** Le bilan du support : un script lancé dans le conteneur, puis un fichier écrit dans les sorties. */
function report(context: PlanContext): PlanStep[] {
  if (!context.hasSandbox) {
    return [say("Je n'ai pas de bac à sable : je ne peux ni lancer un script ni écrire un fichier.")];
  }
  return [
    say("Je prépare le bilan du support dans mon bac à sable."),
    { type: "sandbox", tool: "bash", target: `python ${REPORT_SCRIPT}`, output: summary(context.desk) },
    {
      type: "sandbox",
      tool: "write",
      target: `/mnt/session/outputs/${REPORT_FILE}`,
      output: "Fichier écrit.",
      file: REPORT_FILE,
    },
    say(`Le bilan est prêt, dans ${REPORT_FILE}.`),
  ];
}

/** Suivre la FAQ : un fichier monté dans le conteneur, que l'agent lit avant de répondre aux questions. */
function followFaq(context: PlanContext): PlanStep[] {
  if (!context.hasSandbox || !context.hasPlan) {
    return [say("Je ne trouve aucune FAQ : aucun fichier n'a été monté dans mon conteneur.")];
  }
  const questions = openTickets(context.desk)
    .filter((ticket) => ticket.kind === "question")
    .slice(0, MAX_CALLS_PER_TURN);
  const replies: PlanStep[] = context.enabledTools.includes("reply_ticket")
    ? questions.map((ticket) => ({ type: "call", tool: "reply_ticket", input: { ticket: ticket.id } }))
    : [missingTool("reply_ticket")];
  const answered = context.enabledTools.includes("reply_ticket")
    ? "J'ai répondu aux questions en suivant la FAQ."
    : "Je ne peux pas répondre aux questions.";
  return [
    say("Je lis la FAQ montée dans mon conteneur."),
    { type: "sandbox", tool: "read", target: `/mnt/${PLAN_FILE}`, output: PLAN_TEXT },
    ...(questions.length === 0 ? [say("Aucune question n'attend de réponse.")] : [...replies, say(answered)]),
  ];
}

/**
 * Les outils web tournent chez Anthropic, mais deux filtres s'appliquent : le
 * réseau de l'environnement, puis la liste de domaines autorisés de l'outil.
 */
function search(context: PlanContext): PlanStep[] {
  if (!context.hasWeb) return [say("Je n'ai pas d'outil pour chercher sur le web.")];
  if (!context.isNetworkOpen) {
    return [
      say("Je cherche sur le web."),
      {
        type: "web",
        tool: "web_search",
        target: SEARCH_QUERY,
        output: "Aucun résultat : le réseau de l'environnement est isolé.",
        isError: false,
      },
      say("Je ne trouve rien : le réseau de mon environnement est isolé, la recherche ne ramène aucun site."),
    ];
  }
  return [
    say("Je cherche sur le web."),
    {
      type: "web",
      tool: "web_search",
      target: SEARCH_QUERY,
      output: `${ALLOWED_DOMAIN} : « ${CARRIER_STATUS} »`,
      isError: false,
    },
    say(`J'ai trouvé le statut du transporteur sur ${ALLOWED_DOMAIN}. ${CARRIER_STATUS}`),
  ];
}

function fetchPage(domain: string, context: PlanContext): PlanStep[] {
  if (!context.hasWeb) return [say("Je n'ai pas d'outil pour lire une page web.")];
  const isAllowed = domain === ALLOWED_DOMAIN && context.isNetworkOpen === true;
  const reason =
    domain === ALLOWED_DOMAIN ? "le réseau de l'environnement est isolé" : `${domain} n'est pas dans la liste autorisée`;
  return [
    say(`J'ouvre ${domain}.`),
    {
      type: "web",
      tool: "web_fetch",
      target: `https://${domain}`,
      output: isAllowed ? `Page lue : « ${CARRIER_STATUS} »` : `url_not_allowed : ${reason}.`,
      isError: !isAllowed,
    },
    say(isAllowed ? "La page est lue." : `Je n'ai pas le droit d'ouvrir cette page : ${reason}.`),
  ];
}

/** Des commandes que la politique « auto » ne traite pas pareil : l'une est risquée, l'autre incertaine. */
function riskyCommand(text: string, context: PlanContext): PlanStep[] | null {
  const command = WIPE_REQUEST.test(text)
    ? ({ target: "rm -rf /workspace", output: "Dossier de travail vidé.", risk: "high" } as const)
    : INSTALL_REQUEST.test(text)
      ? ({ target: "pip install support-utils", output: "Paquet installé.", risk: "unclear" } as const)
      : null;
  if (!command) return null;
  if (!context.hasSandbox) return [say("Je n'ai pas de bac à sable pour lancer cette commande.")];
  return [
    say("Je lance la commande dans mon bac à sable."),
    { type: "sandbox", tool: "bash", ...command },
    say("C'est fait."),
  ];
}

/**
 * Les consignes qui passent par autre chose que les outils du support : le bac
 * à sable, le web, un fichier monté. `null` si la consigne porte sur les tickets.
 */
export function specialPlan(text: string, context: PlanContext): PlanStep[] | null {
  if (REPORT_REQUEST.test(text)) return report(context);
  if (PLAN_REQUEST.test(text)) return followFaq(context);
  const page = FETCH_REQUEST.exec(text);
  if (page) return fetchPage(page[1], context);
  if (SEARCH_REQUEST.test(text)) return search(context);
  return riskyCommand(text, context);
}
