import { AGENT_DESK, WORKBENCH_STAND } from "@/lib/workshop/layout";
import type { CodeFile, Lesson } from "../types";
import { WALK_MS } from "./session";

const SETUP_FILE: CodeFile = {
  name: "setup.ts",
  blocks: [
    {
      id: "client",
      lines: ['import Anthropic from "@anthropic-ai/sdk";', "", "const client = new Anthropic();", ""],
    },
    {
      id: "create",
      lines: [
        "// L'environnement : le modèle du conteneur où l'agent travaillera.",
        "const environment = await client.beta.environments.create({",
        '  name: "support",',
        "  config: {",
        '    type: "cloud", // un conteneur hébergé par Anthropic',
      ],
    },
    {
      id: "limited",
      lines: [
        "    // Réseau fermé : rien ne sort, sauf vers ce que tu listes.",
        "    // Écris-le toujours : sans cette ligne, l'API ouvre tout.",
        '    networking: { type: "limited", allowed_hosts: ["api.transporteur.example", "paiements.example"] },',
      ],
    },
    {
      id: "open",
      lines: ["    // L'autre choix : presque tout Internet est joignable.", '    // networking: { type: "unrestricted" },'],
    },
    {
      id: "close",
      lines: ["  },", "});", ""],
    },
    {
      id: "reuse",
      lines: [
        "// À créer une seule fois. Chaque session recevra un conteneur neuf,",
        "// fabriqué d'après ce modèle.",
        'await saveId("ENVIRONMENT_ID", environment.id);',
      ],
    },
  ],
};

const FILE = SETUP_FILE.name;

/** L'environnement : la machine où l'agent travaille, ce qui en sort, et ce qui y tourne. */
export const ENVIRONMENT_LESSON: Lesson = {
  id: "environment",
  title: "L'environnement",
  summary: "Où l'agent travaille : un conteneur isolé, hébergé par Anthropic.",
  before: { adds: ["agent", "room"], actions: [{ type: "move", to: AGENT_DESK, durationMs: 0 }] },
  files: [SETUP_FILE],
  steps: [
    {
      id: "why",
      title: "Un endroit où travailler",
      text: [
        "Un agent ne fait pas que parler. Il peut avoir à lancer une commande, lire un fichier, écrire un rapport.",
        "Pour cela, il lui faut une machine. L'environnement décrit cette machine : un conteneur, hébergé par Anthropic.",
        "Sur la scène, c'est l'établi, au fond de la pièce. La pièce, elle, c'est la plateforme : la boucle de l'agent y tourne, en dehors du conteneur.",
      ],
      code: { file: FILE, blocks: ["client", "create", "close"] },
      adds: ["bench"],
    },
    {
      id: "isolated",
      title: "Fermé, si tu le demandes",
      text: [
        "Ce conteneur est isolé. Avec un réseau « limited », rien n'en sort, sauf vers les adresses que tu autorises.",
        "La trappe barrée au-dessus de l'établi, c'est sa sortie réseau : elle est fermée.",
        "Attention : si tu n'écris pas « networking », l'API ouvre tout. Écris-le toujours.",
      ],
      code: { file: FILE, blocks: ["limited"] },
      sets: { networking: "limited" },
    },
    {
      id: "open",
      title: "Ou ouvert, si tu le décides",
      text: [
        "Avec « unrestricted », le conteneur peut joindre presque tout Internet : la trappe s'ouvre. Anthropic n'applique qu'une liste de blocage générale : ce n'est pas une protection sur laquelle compter.",
        "C'est plus pratique, et plus risqué : ce que l'agent lit dehors peut l'influencer. Commence fermé, et ouvre ce dont il a besoin.",
      ],
      code: { file: FILE, blocks: ["open"] },
      sets: { networking: "unrestricted" },
    },
    {
      id: "inside",
      title: "Ce qui tourne dedans",
      text: [
        "Lancer une commande, lire ou écrire un fichier : ces outils intégrés s'exécutent dans le conteneur. L'agent va à son établi.",
        "Tout le reste tourne ailleurs. La boucle de l'agent, chez Anthropic, hors du conteneur. Et tes propres outils, chez toi : on y vient au chapitre suivant.",
      ],
      code: { file: FILE, blocks: ["create", "limited", "close"] },
      sets: { networking: "limited" },
      actions: [
        { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
      ],
    },
    {
      id: "template",
      title: "Un modèle, pas une machine",
      text: [
        "Un environnement se crée une seule fois. Ce n'est pas une machine allumée : c'est la recette pour en fabriquer.",
        "Chaque session reçoit un conteneur neuf, fabriqué d'après elle. Entre deux messages, son contenu est conservé, mais seulement 30 jours après la création du conteneur : l'activité ne prolonge pas ce délai.",
        "Il disparaît quand tu supprimes la session.",
      ],
      code: { file: FILE, blocks: ["reuse"] },
      actions: [
        { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
        { type: "mood", mood: "idle" },
      ],
    },
  ],
};
