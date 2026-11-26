import type { Hop } from "./effects";
import type { PartId } from "./parts";

/** Ce que l'introduction fait apparaître, une pièce à la fois. */
export type Layer = "agent" | "desk" | "app" | "context" | "room" | "entries";

/** Un chapitre de l'introduction : une idée, la pièce qu'elle ajoute à la scène, et où regarder. */
export interface IntroChapter {
  readonly id: string;
  readonly title: string;
  readonly lines: readonly string[];
  /** Ce que ce chapitre ajoute à ce qui était déjà là. */
  readonly adds: readonly Layer[];
  /** La partie de la scène sur laquelle la caméra se pose. */
  readonly focus: PartId;
  /** Les liaisons à montrer, l'une après l'autre : qui parle à qui. */
  readonly links: readonly Hop[];
  /** Ce que dit le modèle pendant ce chapitre, s'il dit quelque chose. */
  readonly says: string | null;
  /** Ce sur quoi il faut cliquer dans la scène pour passer à la suite, et comment le demander. */
  readonly target: PartId;
  readonly prompt: string;
}

/** La pièce qui doit être posée pour qu'une partie de la scène soit cliquable. */
export const LAYER_OF_PART: Readonly<Partial<Record<PartId, Layer>>> = {
  agent: "agent",
  desk: "desk",
  app: "app",
  tools: "app",
  orders: "app",
  context: "context",
  session: "room",
  entries: "entries",
};

export const INTRO: readonly IntroChapter[] = [
  {
    id: "model",
    title: "Un modèle, tout seul",
    lines: [
      "Voici Claude, un modèle de langage. On lui écrit, il répond.",
      "C'est tout ce qu'il sait faire : produire du texte. Il ne peut rien toucher dans le monde.",
    ],
    adds: ["agent"],
    focus: "agent",
    links: [],
    says: null,
    target: "agent",
    prompt: "Clique sur le modèle pour lui écrire.",
  },
  {
    id: "problem",
    title: "Un problème à régler",
    lines: [
      "Voici la boîte de support de ton entreprise : des clients y écrivent, et trois tickets attendent déjà.",
      "Le modèle ne peut ni les lire, ni y répondre. Rien ne le relie à cette boîte.",
    ],
    adds: ["desk"],
    focus: "agent",
    links: [],
    says: "Bonjour ! Je sais écrire. C'est tout ce que je sais faire.",
    target: "desk",
    prompt: "Clique sur la boîte de support, à droite.",
  },
  {
    id: "tools",
    title: "On lui donne des outils",
    lines: [
      "Tu lui décris des actions possibles : « répondre à un ticket », « chercher une commande ».",
      "Il ne les exécute pas lui-même. Il demande, et c'est ton application qui agit, avec ses accès à elle.",
    ],
    adds: ["app"],
    focus: "agent",
    links: [{ from: "agent", to: "app", label: "« réponds au ticket »", tone: "call" }],
    says: "Ces tickets, je ne peux pas les ouvrir. Sauf si on me donne des outils.",
    target: "tools",
    prompt: "Clique sur les outils custom, dans le panneau « Ton application ».",
  },
  {
    id: "loop",
    title: "La boucle",
    lines: [
      "Il demande un outil, ton code agit, le résultat lui revient, et il décide de la suite. Puis il recommence, jusqu'à avoir fini.",
      "Un modèle, des outils, une boucle : c'est ça, un agent.",
    ],
    adds: [],
    focus: "agent",
    links: [
      { from: "agent", to: "app", label: "1 · il demande un outil", tone: "call" },
      { from: "app", to: "desk", label: "2 · ton code agit", tone: "effect" },
      { from: "app", to: "agent", label: "3 · le résultat revient", tone: "result" },
    ],
    says: null,
    target: "agent",
    prompt: "Clique sur le modèle : que retient-il de tout ça ?",
  },
  {
    id: "context",
    title: "Sa mémoire de travail",
    lines: [
      "À chaque tour de boucle, le modèle relit tout depuis le début : ses consignes, ses outils, les messages, les appels, les résultats.",
      "Cette pile, c'est sa fenêtre de contexte. Il n'a rien d'autre en tête.",
    ],
    adds: ["context"],
    focus: "context",
    links: [],
    says: null,
    target: "context",
    prompt: "Clique sur la pile pour voir où tout cela tourne.",
  },
  {
    id: "session",
    title: "Qui fait tourner la boucle ?",
    lines: [
      "Avec Managed Agents, c'est Anthropic. Une session héberge l'agent, son contexte, et un conteneur où il peut exécuter du code.",
      "Toi, tu fournis les outils et tu écoutes ce qui se passe.",
    ],
    adds: ["room"],
    focus: "session",
    links: [],
    says: null,
    target: "app",
    prompt: "Clique sur le panneau « Ton application » : c'est elle qui le réveille.",
  },
  {
    id: "entries",
    title: "Ce qui le réveille",
    lines: [
      "Un agent ne fait rien tant qu'on ne lui écrit pas : il dort.",
      "Un clic dans ton interface, un client qui écrit, une horloge : ce sont ses points d'entrée.",
    ],
    adds: ["entries"],
    focus: "overview",
    links: [
      { from: "desk", to: "webhook", label: "un client écrit", tone: "entry" },
      { from: "webhook", to: "agent", label: "ton serveur le réveille", tone: "entry" },
    ],
    says: null,
    target: "entries",
    prompt: "Clique sur les points d'entrée, dans « Ton application ».",
  },
  {
    id: "build",
    title: "À toi de le construire",
    lines: [
      "Tu as vu le plan. Tu vas maintenant le monter pièce par pièce : l'environnement, le vault, les outils, l'agent, puis une session.",
      "Ensuite, clique sur l'agent, sur un objet de sa pièce ou sur un panneau pour lire ce que c'est.",
    ],
    adds: [],
    focus: "overview",
    links: [],
    says: "À toi de me construire.",
    target: "session",
    prompt: "Clique sur le nom de la session, en haut de la pièce, pour commencer à la construire.",
  },
];

/** Tout ce qui est visible à ce chapitre : ce qu'il ajoute, et ce que les précédents avaient posé. */
export function visibleLayers(index: number): ReadonlySet<Layer> {
  return new Set(INTRO.slice(0, index + 1).flatMap((chapter) => chapter.adds));
}

/** Le chapitre à cet indice, borné aux extrémités de l'introduction. */
export function chapterAt(index: number): IntroChapter {
  return INTRO[Math.min(INTRO.length - 1, Math.max(0, index))];
}
