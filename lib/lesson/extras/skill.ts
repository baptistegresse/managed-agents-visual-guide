import { event } from "@/lib/workshop/effects";
import { LIBRARY_STAND } from "@/lib/workshop/layout";
import type { CodeFile, Lesson } from "../types";
import { agentReply, BACK_TO_BED, openingStep, SETUP, userMessage, WALK_MS } from "./shared";

const SKILL_DESCRIPTION = "La procédure à suivre avant de rembourser un client.";
const PROCEDURE = [
  "1. Vérifie que la commande a moins de 30 jours.",
  "2. Vérifie que l'article a été renvoyé.",
  "3. Au-delà de 100 €, transmets le dossier à un humain.",
] as const;

const SKILL_FILE: CodeFile = {
  name: "skills/remboursement/SKILL.md",
  blocks: [
    {
      id: "description",
      lines: ["---", "name: remboursement", `description: ${SKILL_DESCRIPTION}`, "---", ""],
    },
    {
      id: "procedure",
      lines: ["# Rembourser un client", "", ...PROCEDURE],
    },
  ],
};

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    {
      id: "head",
      lines: [
        'import Anthropic, { toFile } from "@anthropic-ai/sdk";',
        'import { readFile } from "node:fs/promises";',
        'import { REPLY_TICKET_TOOL } from "./tools"; // l\'outil custom de la leçon principale',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "upload",
      lines: [
        "// Le skill : un dossier, avec SKILL.md à sa racine. Tu le déposes une fois.",
        "const skill = await client.skills.create({",
        '  files: [await toFile(readFile("skills/remboursement/SKILL.md"), "remboursement/SKILL.md")],',
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
      ],
    },
    {
      id: "attach",
      lines: [
        "  // Attaché à l'agent : seule sa description entre dans la pile à l'ouverture.",
        '  skills: [{ type: "custom", skill_id: skill.id, version: "latest" }],',
      ],
    },
    {
      id: "tools",
      lines: [
        "  tools: [",
        "    REPLY_TICKET_TOOL,",
        "    // L'agent ouvre SKILL.md avec l'outil « read » de la boîte à outils intégrée.",
        "    {",
        '      type: "agent_toolset_20260401",',
        '      default_config: { enabled: true, permission_policy: { type: "auto" } },',
        "      configs: [",
        '        { name: "web_search", enabled: false },',
        '        { name: "web_fetch", enabled: false },',
        "      ],",
        "    },",
        "  ],",
        "});",
      ],
    },
  ],
};

const SKILL = SKILL_FILE.name;

/** Un skill n'occupe qu'une ligne de la pile tant que la tâche ne demande pas de l'ouvrir. */
export const SKILL_LESSON: Lesson = {
  id: "skill",
  title: "Un skill, chargé à la demande",
  summary: "Une procédure rangée dans un dossier : l'agent n'en lit le contenu que si la tâche le demande.",
  files: [SKILL_FILE, SETUP_FILE],
  steps: [
    openingStep({
      id: "library",
      title: "Un savoir-faire rangé dans la bibliothèque",
      text: [
        "Un skill est un dossier : un fichier « SKILL.md » qui décrit une procédure, parfois accompagné de scripts.",
        "Celui-ci explique comment traiter un remboursement.",
        "À l'ouverture de la session, seule sa description entre dans la pile : une ligne, pas la procédure.",
      ],
      code: { file: SKILL, blocks: ["description"] },
      adds: ["library"],
      session: {
        extraToolLines: ["read : lit un fichier dans le conteneur de la session", `skill « remboursement » : ${SKILL_DESCRIPTION}`],
      },
    }),
    {
      id: "attach",
      title: "Tu l'attaches à l'agent",
      text: [
        "Tu déposes le dossier une fois, puis tu cites son identifiant dans la configuration de l'agent.",
        "Il lui faut aussi l'outil « read » : c'est avec lui que l'agent ouvrira le fichier.",
      ],
      code: { file: SETUP, blocks: ["upload", "attach", "tools"] },
    },
    {
      id: "read",
      title: "La tâche le demande : l'agent ouvre le skill",
      text: [
        "Ton backend demande : « Alice veut être remboursée. Que faut-il vérifier ? »",
        "La description du skill correspond à la tâche. L'agent va donc lire « SKILL.md » avec l'outil « read ».",
        "C'est un « agent.tool_use » ordinaire, exécuté dans le conteneur.",
      ],
      code: { file: SKILL, blocks: ["description"] },
      actions: [
        ...userMessage("Alice veut être remboursée. Que faut-il vérifier ?"),
        event("agent.tool_use", "read : SKILL.md du skill « remboursement »", "agent"),
        { type: "move", to: LIBRARY_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
        { type: "spot", spot: "library" },
      ],
    },
    {
      id: "loaded",
      title: "La procédure entre dans la pile",
      text: [
        "Le contenu du fichier revient avec « agent.tool_result ».",
        "C'est seulement maintenant que la procédure occupe de la place dans la pile. Pour une demande sans rapport, l'agent n'aurait rien chargé.",
      ],
      code: { file: SKILL, blocks: ["procedure"] },
      actions: [
        { type: "spot", spot: "library" },
        event("agent.tool_result", PROCEDURE.join(" "), "sandbox"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "L'agent applique la procédure",
      text: [
        "L'agent répond en suivant ce qu'il vient de lire, et le tour se termine.",
        "Tant qu'il ne l'ouvre pas, un skill ne coûte qu'une ligne dans la pile. Mais chacun rallonge le démarrage du conteneur : n'attache que ceux dont l'agent a besoin.",
      ],
      code: { file: SKILL, blocks: ["description", "procedure"] },
      actions: [
        ...agentReply("Trois vérifications : la commande a moins de 30 jours, l'article est renvoyé, et au-delà de 100 € un humain décide."),
        ...BACK_TO_BED,
      ],
    },
  ],
};
