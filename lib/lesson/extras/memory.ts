import { event } from "@/lib/workshop/effects";
import type { CodeFile, Lesson } from "../types";
import {
  agentReply,
  BACK_TO_BED,
  CLIENT_BLOCK,
  openingStep,
  openSession,
  ROUTE,
  SETUP,
  userMessage,
  type SessionOptions,
} from "./shared";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    CLIENT_BLOCK,
    {
      id: "store",
      lines: [
        "// Le carnet : des petits fichiers texte qui survivent aux sessions.",
        "// La description est lue par l'agent : dis-lui ce qu'il y trouvera.",
        "const store = await client.beta.memoryStores.create({",
        '  name: "carnet-support",',
        '  description: "Le ton à employer avec les clients.",',
        "});",
        "",
        "await saveIds({ memoryStoreId: store.id });",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "session",
      lines: ["  const session = await client.beta.sessions.create({", "    agent: AGENT_ID,", "    environment_id: ENVIRONMENT_ID,"],
    },
    {
      id: "mount",
      lines: [
        "    // Le carnet est monté dans le conteneur, sous /mnt/memory/carnet-support/.",
        "    // L'agent le lit et l'écrit avec ses outils de fichiers intégrés.",
        '    resources: [{ type: "memory_store", memory_store_id: MEMORY_STORE_ID, access: "read_write" }],',
        "  });",
      ],
    },
  ],
};

const NOTE_PATH = "/mnt/memory/carnet-support/ton.md";
const NOTE = "Tutoyer les clients.";

/** Chaque session du chapitre a le carnet monté, et ses consignes le signalent d'une ligne. */
const SESSION: SessionOptions = {
  system: "Tu réponds aux clients du support.\nCarnet monté : /mnt/memory/carnet-support/ (lecture et écriture).",
  extraToolLines: ["read, write : outils de fichiers, exécutés dans le conteneur de la session"],
};

/** Un carnet monté comme un dossier : ce qu'une session y écrit, une autre peut le relire. */
export const MEMORY_LESSON: Lesson = {
  id: "memory",
  title: "Une mémoire entre deux sessions",
  summary: "Un carnet monté comme un dossier : ce qu'une session y écrit, la suivante peut le relire.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "forget",
      title: "Une session oublie tout",
      text: [
        "Chaque session repart d'une pile neuve : ce que l'agent a appris hier n'existe plus.",
        "Un « memory store » est un carnet qui survit aux sessions. Tu le crées une fois, puis tu le montes dans le conteneur de chaque session.",
        "Pour l'agent, c'est un simple dossier, posé ici sur la table de chevet. Il le lit et l'écrit avec ses outils de fichiers : l'agent doit donc avoir la boîte à outils intégrée (« agent_toolset_20260401 ») activée.",
      ],
      code: { file: SETUP, blocks: ["store"] },
      adds: ["memory"],
      session: SESSION,
    }),
    {
      id: "write",
      title: "L'agent écrit dans le carnet",
      text: [
        "Ton backend transmet une consigne : « Désormais, on tutoie les clients. »",
        "L'agent l'enregistre avec l'outil « write », dans le dossier monté.",
        "C'est un outil intégré : il s'exécute dans le conteneur, sans passer par ton backend.",
      ],
      code: { file: ROUTE, blocks: ["session", "mount"] },
      actions: [
        ...userMessage("Désormais, on tutoie les clients. Retiens-le."),
        event("agent.tool_use", `write : ${NOTE_PATH}`, "agent"),
        { type: "memoryUse", isActive: true },
        { type: "memory", notes: [NOTE] },
        event("agent.tool_result", "Fichier écrit : ton.md", "sandbox"),
        { type: "modelRequest" },
        ...agentReply("C'est noté : je tutoierai les clients."),
      ],
    },
    {
      id: "new-session",
      title: "Le lendemain : une session neuve",
      text: [
        "Ton backend ouvre une autre session. Sa pile repart des consignes et des outils : la phrase d'hier n'y est plus.",
        "Le carnet, lui, n'a pas bougé : il est monté dans ce nouveau conteneur, avec la note dedans.",
        "Une ligne ajoutée aux consignes signale à l'agent que le carnet existe. Les notes, elles, n'y sont pas.",
      ],
      code: { file: ROUTE, blocks: ["session", "mount"] },
      actions: [openSession(SESSION)],
    },
    {
      id: "read",
      title: "L'agent relit le carnet",
      text: [
        "Ton backend demande d'écrire à Bruno. Avant de rédiger, l'agent lit le dossier monté.",
        "La note entre dans la pile à ce moment-là, et seulement parce qu'il est allé la lire.",
      ],
      code: { file: ROUTE, blocks: ["mount"] },
      actions: [
        ...userMessage("Écris à Bruno que son colis repart demain."),
        event("agent.tool_use", `read : ${NOTE_PATH}`, "agent"),
        { type: "memoryUse", isActive: true },
        event("agent.tool_result", NOTE, "sandbox"),
        { type: "modelRequest" },
      ],
    },
    {
      id: "reply",
      title: "Il répond sur le bon ton",
      text: [
        "L'agent tutoie Bruno, comme la note le demande.",
        "La mémoire n'est pas dans le modèle : c'est un fichier, relu par une session qui ne savait rien.",
      ],
      code: { file: ROUTE, blocks: ["mount"] },
      actions: agentReply("Salut Bruno ! Ton colis repart demain."),
    },
    {
      id: "done",
      title: "Ce qu'on n'écrit pas dans un carnet",
      text: [
        "Tout ce qui est écrit dans le carnet sera relu tel quel par les sessions suivantes.",
        "N'y range donc jamais un secret : les clés vont dans le vault.",
      ],
      code: { file: SETUP, blocks: ["store"] },
      actions: BACK_TO_BED,
    },
  ],
};
