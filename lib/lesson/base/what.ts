import { AGENT_DESK } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../types";

const MODEL_FILE: CodeFile = {
  name: "modele.ts",
  blocks: [
    {
      id: "call",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        "",
        "const client = new Anthropic();",
        "",
        "// Un appel au modèle : du texte entre, du texte sort.",
        "const response = await client.messages.create({",
        '  model: "claude-haiku-5-5",',
        "  max_tokens: 1024,",
        "  messages: [{ role: \"user\", content: \"Réponds au ticket d'Alice.\" }],",
        "});",
        "",
      ],
    },
    {
      id: "answer",
      lines: [
        "// response.content :",
        "//   « Je n'ai pas accès à vos tickets. Voici ce que je",
        "//     répondrais à Alice si je le pouvais… »",
      ],
    },
  ],
};

const LOOP_FILE: CodeFile = {
  name: "boucle.ts",
  blocks: [
    {
      id: "tools",
      lines: [
        "// On décrit au modèle ce qu'il a le droit de demander.",
        "const tools = [",
        "  {",
        '    name: "reply_ticket",',
        '    description: "Envoie une réponse au client et résout son ticket.",',
        "    input_schema: {",
        '      type: "object",',
        '      properties: { ticket: { type: "integer" } },',
        '      required: ["ticket"],',
        "    },",
        "  },",
        "];",
        "",
      ],
    },
    {
      id: "ask",
      lines: [
        "const messages = [{ role: \"user\", content: \"Réponds au ticket d'Alice.\" }];",
        "",
        "while (true) {",
        "  // À chaque tour, on renvoie TOUTE la conversation au modèle.",
        "  const response = await client.messages.create({",
        '    model: "claude-haiku-5-5",',
        "    max_tokens: 1024,",
        "    tools,",
        "    messages,",
        "  });",
        '  messages.push({ role: "assistant", content: response.content });',
        "",
      ],
    },
    {
      id: "stop",
      lines: ["  // Plus d'outil demandé : il a fini.", '  if (response.stop_reason !== "tool_use") break;', ""],
    },
    {
      id: "run",
      lines: [
        "  // Il demande un outil : c'est à toi de l'exécuter…",
        "  const results = [];",
        "  for (const block of response.content) {",
        '    if (block.type !== "tool_use") continue;',
        "    const output = await runTool(block.name, block.input);",
        '    results.push({ type: "tool_result", tool_use_id: block.id, content: output });',
        "  }",
        "",
      ],
    },
    {
      id: "back",
      lines: ["  // …puis de lui rendre le résultat, et de recommencer.", '  messages.push({ role: "user", content: results });', "}"],
    },
  ],
};

const MANAGED_FILE: CodeFile = {
  name: "managed.ts",
  blocks: [
    {
      id: "managed",
      lines: [
        "// Avec Managed Agents, la boucle ne tourne plus chez toi.",
        "// Tu décris l'agent une fois…",
        "const agent = await client.beta.agents.create({ name, model, system, tools });",
        "",
        "// …puis tu lances une session, et tu lui écris.",
        "const session = await client.beta.sessions.create({",
        "  agent: agent.id,",
        "  environment_id: environment.id,",
        "});",
        "await client.beta.sessions.events.send(session.id, {",
        "  events: [",
        "    { type: \"user.message\", content: [{ type: \"text\", text: \"Réponds au ticket d'Alice.\" }] },",
        "  ],",
        "});",
        "",
      ],
    },
    {
      id: "objects",
      lines: [
        "// Les quatre objets à connaître :",
        "//   agent        ce qu'il est : un modèle, des consignes, des outils",
        "//   environment  où il travaille : le modèle de son conteneur",
        "//   session      une exécution : c'est là que tout se passe",
        "//   vault        les clés des services qu'il appelle sans toi",
      ],
    },
  ],
};

/**
 * Le premier chapitre : ce qu'est un agent (un modèle, des outils, une boucle),
 * et ce que Managed Agents prend en charge à ta place.
 */
export const WHAT_LESSON: Lesson = {
  id: "what",
  title: "Un agent, c'est quoi ?",
  summary: "Un modèle, des outils, une boucle. Et ce que Managed Agents fait à ta place.",
  files: [MODEL_FILE, LOOP_FILE, MANAGED_FILE],
  steps: [
    {
      id: "model",
      title: "D'abord, un modèle",
      text: [
        "Claude est un modèle de langage : on lui envoie du texte, il renvoie du texte.",
        "Un appel, une réponse. Entre deux appels, il ne se souvient de rien et ne fait rien.",
      ],
      code: { file: MODEL_FILE.name, blocks: ["call"] },
      adds: ["agent"],
      actions: [
        { type: "move", to: AGENT_DESK, durationMs: 0 },
        { type: "bubble", text: "Bonjour ! On m'écrit, je réponds." },
      ],
    },
    {
      id: "limits",
      title: "Seul, il ne peut rien faire",
      text: [
        "Demande-lui de répondre au ticket d'Alice : il ne peut qu'écrire ce qu'il ferait.",
        "Il n'a accès ni à ta boîte de support, ni à ta base, ni à rien d'autre. Produire du texte, c'est tout.",
      ],
      code: { file: MODEL_FILE.name, blocks: ["call", "answer"] },
      actions: [{ type: "bubble", text: "Je ne peux pas ouvrir ce ticket. Je peux seulement écrire." }],
    },
    {
      id: "tools",
      title: "On lui donne des outils",
      text: [
        "Un outil, c'est une action que tu lui décris : un nom, à quoi elle sert, ce qu'il faut lui fournir.",
        "Le modèle ne l'exécute pas. Au lieu de répondre, il écrit une demande : « appelle reply_ticket pour le ticket 1 ».",
        "Quelqu'un d'autre doit faire l'action, puis lui dire ce qui s'est passé.",
      ],
      code: { file: LOOP_FILE.name, blocks: ["tools"] },
      actions: [
        { type: "bubble", text: null },
        { type: "mood", mood: "waiting" },
        hop("agent", "app", "reply_ticket", "call"),
      ],
    },
    {
      id: "loop",
      title: "La boucle",
      text: [
        "Il demande un outil, on l'exécute, on lui rend le résultat, et il décide de la suite. On recommence jusqu'à ce qu'il n'ait plus rien à demander.",
        "Un modèle, des outils, une boucle : c'est ça, un agent.",
      ],
      code: { file: LOOP_FILE.name, blocks: ["ask", "stop", "run", "back"] },
      actions: [
        { type: "mood", mood: "thinking" },
        hop("app", "agent", "résultat", "result"),
      ],
    },
    {
      id: "burden",
      title: "Faire tourner cette boucle, c'est du travail",
      text: [
        "Ce code doit tourner quelque part, parfois longtemps. Il faut garder toute la conversation, la renvoyer à chaque tour, et reprendre après une panne.",
        "Et si l'agent doit lancer une commande ou lire un fichier, il lui faut une machine, isolée du reste.",
      ],
      code: { file: LOOP_FILE.name, blocks: ["ask", "run"] },
      actions: [{ type: "mood", mood: "idle" }],
    },
    {
      id: "managed",
      title: "Le but de Managed Agents",
      text: [
        "Managed Agents fait tout cela à ta place, chez Anthropic : la boucle, la mémoire de la conversation, la machine où l'agent travaille.",
        "Cette pièce, c'est ça : l'endroit où ton agent tourne, hébergé pour toi.",
        "Il te reste trois choses à faire : décrire l'agent, exécuter tes propres outils, et écouter ce qui se passe.",
      ],
      code: { file: MANAGED_FILE.name, blocks: ["managed"] },
      adds: ["room"],
    },
    {
      id: "objects",
      title: "Quatre objets à connaître",
      text: [
        "L'agent : ce qu'il est. L'environnement : où il travaille. La session : une exécution. Le vault : les clés des services qu'il appelle sans toi.",
        "On les prend un par un, en commençant par l'endroit où il travaille. Et entre ton backend et une session, tout passe par des événements : on les verra avec elle.",
      ],
      code: { file: MANAGED_FILE.name, blocks: ["objects"] },
    },
  ],
};
