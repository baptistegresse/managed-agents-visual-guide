import { frameAround, type Frame, type GridBox } from "./camera";
import { CONTEXT_STACK, SCENE_VIEW, VAULT } from "./layout";

export type PartId =
  | "overview"
  | "session"
  | "agent"
  | "context"
  | "vault"
  | "app"
  | "entries"
  | "tools"
  | "orders"
  | "desk"
  | "services";

/** Une partie de la scène sur laquelle on peut zoomer, avec ce qu'il faut en comprendre. */
export interface Part {
  readonly id: PartId;
  readonly label: string;
  /**
   * Ce qu'il faut voir en entier quand on zoome dessus. `null` pour ce qui n'est pas
   * un objet de la pièce : la vue d'ensemble, la session elle-même, et tout ce qui
   * vit dans les panneaux de côté.
   */
  readonly box: GridBox | null;
  /** Ce que c'est. */
  readonly what: string;
  /** Où ça tourne, et qui y a accès. */
  readonly who: string;
  /** Ce que ça devient dans le vrai code. */
  readonly code: string;
}

/** Marge autour d'une partie zoomée, en pixels de la scène : la place de ses étiquettes. */
const FOCUS_PADDING = 34;

export const PARTS: readonly Part[] = [
  {
    id: "overview",
    label: "Vue d'ensemble",
    box: null,
    what: "Au centre, la pièce de l'agent : la session. À gauche, ton application, qui reçoit les demandes et exécute ses outils. À droite, la boîte de support et les services tiers.",
    who: "Rien de tout cela ne tourne au même endroit : c'est pour ça que les appels sortent de la pièce, d'un côté ou de l'autre.",
    code: "agents.create → sessions.create → sessions.events",
  },
  {
    id: "session",
    label: "La session",
    box: null,
    what: "Une exécution de ton agent. C'est elle qui fait tourner la boucle : appeler le modèle, lancer l'outil qu'il demande, lui rendre le résultat, recommencer.",
    who: "Tout ce qui est dans cette pièce tourne chez Anthropic. Toi, tu lui écris et tu écoutes ses événements.",
    code: "client.beta.sessions.create({ agent, environment_id, vault_ids })",
  },
  {
    id: "agent",
    label: "L'agent",
    box: { x0: 0.1, y0: 2.3, x1: 4.2, y1: 4.9, height: 2 },
    what: "Un modèle, des consignes et une liste d'outils. Seul, le modèle ne produit que du texte : c'est en demandant des outils qu'il agit. Il dort tant que personne ne lui écrit.",
    who: "Il ne voit ni tes clés, ni ta base, ni la boîte de support : seulement ce qu'on place dans son contexte.",
    code: "client.beta.agents.create({ model, system, tools })",
  },
  {
    id: "context",
    label: "Son contexte",
    box: {
      x0: CONTEXT_STACK.x - 0.5,
      y0: CONTEXT_STACK.y - 0.5,
      x1: CONTEXT_STACK.x + CONTEXT_STACK.size + 0.4,
      y1: CONTEXT_STACK.y + CONTEXT_STACK.size + 0.4,
      height: 2.7,
    },
    what: "Tout ce que le modèle relit à chaque tour de boucle : consignes, définitions d'outils, messages, appels, résultats. Il n'a aucune autre mémoire.",
    who: "La pile grandit à chaque appel. Pleine, la plateforme résume les échanges les plus anciens pour faire de la place.",
    code: "événement agent.thread_context_compacted",
  },
  {
    id: "vault",
    label: "Le vault",
    box: { x0: 0, y0: 0, x1: VAULT.x + VAULT.size + 0.6, y1: VAULT.y + VAULT.size + 0.6, height: 1.9 },
    what: "Le coffre où sont rangés les identifiants des services tiers.",
    who: "La plateforme joint la clé à l'appel au moment où il part. Ni l'agent ni ton application ne la voient passer.",
    code: "client.beta.vaults.credentials.create(vault.id, { auth })",
  },
  {
    id: "app",
    label: "Ton application",
    box: null,
    what: "Ton serveur. C'est lui qui reçoit les demandes, un clic ou un webhook, et qui exécute les outils custom que l'agent réclame.",
    who: "Tout ce qui est ici tourne chez toi, avec tes accès à toi.",
    code: "client.beta.sessions.events.send(session.id, { events })",
  },
  {
    id: "entries",
    label: "Les points d'entrée",
    box: null,
    what: "Ce qui démarre un tour : un clic dans ton interface (appel API) ou un message d'un client (webhook). L'horloge du déploiement planifié, elle, est dans la session, côté Anthropic.",
    who: "Pour un clic ou un webhook, c'est ton serveur qui écrit dans la session.",
    code: 'events: [{ type: "user.message", content }]',
  },
  {
    id: "tools",
    label: "Tes outils custom",
    box: null,
    what: "Les actions que tu proposes à l'agent. Il décide d'en appeler une ; la session s'arrête ; ton code l'exécute et lui renvoie le résultat.",
    who: "L'agent n'en connaît que le nom et la description. Le code, lui, reste chez toi.",
    code: "agent.custom_tool_use → user.custom_tool_result",
  },
  {
    id: "orders",
    label: "Ta base de commandes",
    box: null,
    what: "Tes données. L'agent ne peut pas les lire : il demande l'outil « Commande », et c'est ton code qui va chercher la réponse.",
    who: "Seul ton code y a accès.",
    code: "tool: lookup_order",
  },
  {
    id: "desk",
    label: "La boîte de support",
    box: null,
    what: "Là où écrivent les clients : c'est le système que l'agent est chargé de gérer. Chaque ligne est un ticket, avec son état.",
    who: "L'agent n'y touche jamais lui-même : ton code y répond, ou un service tiers y agit.",
    code: "webhook → ta route → sessions.events.send",
  },
  {
    id: "services",
    label: "Les services tiers",
    box: null,
    what: "Des services extérieurs, un prestataire de paiement, un transporteur, que la plateforme appelle directement par MCP, sans passer par ton application.",
    who: "Il leur faut une clé, rangée dans le vault. Ils n'apparaissent que si tu donnes leur outil à l'agent.",
    code: 'tools: [{ type: "mcp_toolset", mcp_server_name }]',
  },
];

export function partById(id: PartId): Part {
  const part = PARTS.find((each) => each.id === id);
  if (!part) throw new Error(`Partie inconnue : ${id}`);
  return part;
}

/** Ce que la caméra doit montrer pour cette partie : la scène entière, ou le cadre serré autour d'elle. */
export function partFrame(id: PartId): Frame {
  const { box } = partById(id);
  return box ? clipToScene(frameAround(box, FOCUS_PADDING)) : SCENE_VIEW;
}

/** La marge ne déborde pas de la scène : au-delà de ses bords, il n'y a rien à montrer. */
function clipToScene(frame: Frame): Frame {
  const left = Math.max(frame.x, SCENE_VIEW.x);
  const top = Math.max(frame.y, SCENE_VIEW.y);
  const right = Math.min(frame.x + frame.width, SCENE_VIEW.x + SCENE_VIEW.width);
  const bottom = Math.min(frame.y + frame.height, SCENE_VIEW.y + SCENE_VIEW.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}
