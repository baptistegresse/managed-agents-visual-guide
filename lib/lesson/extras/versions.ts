import type { CodeFile, Lesson } from "../types";
import { agentReply, BACK_TO_BED, openingStep, openSession, ROUTE, userMessage } from "./shared";

const FIRST_VERSION = 1;
const SECOND_VERSION = 2;
const SECOND_SYSTEM = "Tu réponds aux clients du support. Tu les tutoies.";
const REQUEST = "Écris à Alice que sa demande est bien reçue.";

const UPDATE_FILE: CodeFile = {
  name: "update-agent.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { AGENT_ID } from "./config";',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "update",
      lines: [
        "// Modifier un agent ne réécrit rien : cela crée une version de plus.",
        "const updated = await client.beta.agents.update(AGENT_ID, {",
        `  version: ${FIRST_VERSION}, // celle que tu modifies : refusé si quelqu'un l'a changée entre-temps`,
        `  system: "${SECOND_SYSTEM}",`,
        "});",
        "",
        `await saveIds({ agentVersion: updated.version }); // ${SECOND_VERSION}`,
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "latest",
      lines: [
        "  // L'identifiant seul : la session prend la dernière version, au moment où elle s'ouvre.",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "  });",
        "",
      ],
    },
    {
      id: "pinned",
      lines: [
        "  // Une version épinglée : la session prend exactement celle-là.",
        "  const pinned = await client.beta.sessions.create({",
        `    agent: { type: "agent", id: AGENT_ID, version: ${FIRST_VERSION} },`,
        "    environment_id: ENVIRONMENT_ID,",
        "  });",
      ],
    },
  ],
};

const UPDATE = UPDATE_FILE.name;

/** Modifier un agent crée une version : les sessions ouvertes gardent la leur, les suivantes choisissent. */
export const VERSIONS_LESSON: Lesson = {
  id: "versions",
  title: "Les versions d'un agent",
  summary: "Modifier un agent crée une version : les sessions ouvertes gardent la leur, les suivantes choisissent.",
  files: [UPDATE_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "versioned",
      title: "Un agent est une configuration versionnée",
      text: [
        `L'agent de la leçon principale est en version ${FIRST_VERSION}, et une session tourne dessus.`,
        "À l'ouverture, ses consignes et ses outils ont été copiés dans la pile de la session.",
      ],
      code: { file: ROUTE, blocks: ["latest"] },
      sets: { agentVersion: FIRST_VERSION },
    }),
    {
      id: "update",
      title: "Tu modifies l'agent : la version 2",
      text: [
        `Tu veux que l'agent tutoie les clients. « agents.update » ne réécrit pas la version ${FIRST_VERSION} : il crée la version ${SECOND_VERSION}.`,
        "Regarde la pile de la session ouverte : elle n'a pas bougé.",
      ],
      code: { file: UPDATE, blocks: ["update"] },
    },
    {
      id: "still-first",
      title: "La session ouverte garde sa version",
      text: [
        "Ton backend envoie une demande à la session déjà ouverte.",
        `L'agent vouvoie Alice : cette session tourne toujours sur la version ${FIRST_VERSION}, et y restera jusqu'au bout.`,
      ],
      code: { file: ROUTE, blocks: ["latest"] },
      actions: [...userMessage(REQUEST), ...agentReply("Bonjour Alice, nous avons bien reçu votre demande.")],
    },
    {
      id: "latest",
      title: "Une nouvelle session prend la dernière",
      text: [
        `Ton backend ouvre une autre session, avec le seul identifiant de l'agent. Elle prend la dernière version : la ${SECOND_VERSION}.`,
        "Les nouvelles consignes sont dans sa pile. La même demande reçoit cette fois une réponse au tutoiement.",
      ],
      code: { file: ROUTE, blocks: ["latest"] },
      sets: { agentVersion: SECOND_VERSION },
      actions: [
        openSession({ system: SECOND_SYSTEM }),
        ...userMessage(REQUEST),
        ...agentReply("Salut Alice, on a bien reçu ta demande."),
      ],
    },
    {
      id: "pin",
      title: "Ou la version que tu épingles",
      text: [
        "Pour ne pas dépendre de la dernière version, nomme celle que tu veux : la session prendra exactement celle-là.",
        `C'est aussi ta marche arrière. Si la version ${SECOND_VERSION} répond moins bien, ouvre les sessions suivantes sur la ${FIRST_VERSION}.`,
      ],
      code: { file: ROUTE, blocks: ["pinned"] },
      actions: BACK_TO_BED,
    },
  ],
};
