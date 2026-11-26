import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../types";
import { agentReply, BACK_TO_BED, openingStep, SETUP, SETUP_HEAD, userMessage } from "./shared";

const ALLOWED_DOMAIN = "transporteur.example";
const TRACKING_URL = `https://${ALLOWED_DOMAIN}/suivi/AB123`;
const OTHER_DOMAIN = "avis-colis.example";
const OTHER_URL = `https://${OTHER_DOMAIN}/retards`;

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "environment",
      lines: [
        "// Le réseau de l'environnement reste fermé, sauf vers le site du transporteur.",
        "const environment = await client.beta.environments.create({",
        '  name: "support",',
        "  config: {",
        '    type: "cloud",',
        `    networking: { type: "limited", allowed_hosts: ["${ALLOWED_DOMAIN}"] },`,
        "  },",
        "});",
        "",
      ],
    },
    {
      id: "agent",
      lines: [
        "const agent = await client.beta.agents.create({",
        '  name: "Assistant support",',
        '  model: "claude-haiku-5-5",',
        '  system: "Tu réponds aux clients du support.",',
        "  tools: [",
        "    REPLY_TICKET_TOOL,",
        "    {",
        '      type: "agent_toolset_20260401",',
        '      default_config: { enabled: true, permission_policy: { type: "auto" } },',
      ],
    },
    {
      id: "web-tools",
      lines: [
        "      configs: [",
        "        // Les outils web tournent sur les serveurs d'Anthropic, pas dans le conteneur.",
        "        // allowed_domains : les seuls sites qu'ils peuvent atteindre.",
        `        { name: "web_search", enabled: true, allowed_domains: ["${ALLOWED_DOMAIN}"] },`,
        `        { name: "web_fetch", enabled: true, allowed_domains: ["${ALLOWED_DOMAIN}"] },`,
        "      ],",
        "    },",
        "  ],",
        "});",
      ],
    },
  ],
};

/** Les outils web tournent chez Anthropic, et ne voient que les sites que tu listes. */
export const WEB_LESSON: Lesson = {
  id: "web",
  title: "Les outils web",
  summary: "Chercher et lire sur le web, depuis les serveurs d'Anthropic, sur les seuls sites que tu autorises.",
  files: [SETUP_FILE],
  steps: [
    openingStep({
      id: "tools",
      title: "Lire le web sans quitter la pièce",
      text: [
        "« web_search » cherche sur le web, « web_fetch » lit une page. Ils font partie de la boîte à outils intégrée.",
        "Mais ils ne s'exécutent pas dans le conteneur. Ce sont les serveurs d'Anthropic qui vont chercher la page, et l'agent n'en reçoit que le contenu.",
      ],
      code: { file: SETUP, blocks: ["agent", "web-tools"] },
      session: {
        extraToolLines: [`web_search, web_fetch : exécutés sur les serveurs d'Anthropic, limités à ${ALLOWED_DOMAIN}`],
      },
    }),
    {
      id: "domains",
      title: "Une liste de sites autorisés",
      text: [
        "« allowed_domains » limite chaque outil aux sites que tu listes : ici, celui du transporteur.",
        "Le réseau de l'environnement est « limited ». Le même site doit donc aussi figurer dans ses « allowed_hosts ».",
      ],
      code: { file: SETUP, blocks: ["environment", "web-tools"] },
    },
    {
      id: "fetch",
      title: "Un appel autorisé",
      text: [
        "Ton backend demande où en est le colis d'Alice, et transmet deux liens : sa page de suivi, et un lien qu'elle a cité.",
        "L'agent demande « web_fetch » sur la page de suivi. Cet outil n'ouvre que des adresses déjà apparues dans la session : c'est pour cela que ton backend la fournit.",
        "L'appel part vers le web depuis les serveurs d'Anthropic. Ni ton backend ni le conteneur n'y prennent part.",
      ],
      code: { file: SETUP, blocks: ["web-tools"] },
      actions: [
        ...userMessage(`Où en est le colis AB123 d'Alice ? Sa page de suivi : ${TRACKING_URL}. Elle cite aussi ${OTHER_URL}.`),
        event("agent.tool_use", `web_fetch : ${TRACKING_URL}`, "agent"),
        hop("agent", "web", "web_fetch", "call"),
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "page",
      title: "La page revient dans la pile",
      text: [
        "Le site est dans la liste : la page est lue, et son contenu revient avec « agent.tool_result ».",
        "Comme pour bash, ton backend voit passer ces événements dans le flux, mais il n'a rien à faire : l'appel a été jugé sûr.",
      ],
      code: { file: SETUP, blocks: ["web-tools"] },
      actions: [
        hop("web", "agent", "résultat", "result"),
        event("agent.tool_result", "Colis AB123 : en cours de livraison, arrivée prévue demain.", "web"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "refused",
      title: "Un appel refusé",
      text: [
        "L'agent veut aussi lire le lien cité par Alice. Ce site n'est pas dans la liste.",
        "La page n'est jamais lue : le résultat revient en erreur, avec le code « url_not_allowed ».",
        "La session, elle, continue.",
      ],
      code: { file: SETUP, blocks: ["web-tools"] },
      actions: [
        event("agent.tool_use", `web_fetch : ${OTHER_URL}`, "agent"),
        hop("agent", "web", "url_not_allowed", "error"),
        event("agent.tool_result", `url_not_allowed : ${OTHER_DOMAIN} n'est pas dans la liste autorisée.`, "web", true),
        { type: "mood", mood: "stunned" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "L'agent répond avec ce qu'il a",
      text: [
        "L'agent répond avec la page qu'il a pu lire, et signale celle qu'il n'a pas pu ouvrir.",
        "Un lien cité par un client est un texte que tu ne maîtrises pas. La liste de sites décide de ce que l'agent peut lire, quoi qu'on lui écrive.",
      ],
      code: { file: SETUP, blocks: ["environment", "web-tools"] },
      actions: [
        ...agentReply("Le colis d'Alice arrive demain. Je n'ai pas pu ouvrir l'autre page : son site n'est pas autorisé."),
        ...BACK_TO_BED,
      ],
    },
  ],
};
