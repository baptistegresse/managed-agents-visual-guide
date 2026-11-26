import { event } from "@/lib/workshop/effects";
import { AGENT_DESK, AGENT_HOME } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../types";

export const WALK_MS = 700;

/** Ce que la session écrit dans le contexte de l'agent avant le premier message. */
export const AGENT_SETUP = {
  system: "Tu réponds aux clients du support.",
  toolLines: ["reply_ticket : envoie une réponse au client et résout son ticket"],
};

export const BACKEND_FILE: CodeFile = {
  name: "app/api/support/route.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { AGENT_ID, ENVIRONMENT_ID } from "./config";',
        'import { replyToTicket } from "./support"; // ton code, tes accès',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "route",
      lines: [
        "// Ta route : c'est elle que ton interface appelle.",
        "export async function POST(request: Request) {",
        "  const { message } = await request.json();",
        "",
      ],
    },
    {
      id: "create-session",
      lines: [
        "  // 1. Une session : une exécution de l'agent, dans son conteneur.",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "  });",
        "",
      ],
    },
    {
      id: "open-stream",
      lines: [
        "  // 2. Ouvre le flux avant d'écrire, pour ne manquer aucun événement.",
        "  const stream = await client.beta.sessions.events.stream(session.id);",
        "",
      ],
    },
    {
      id: "send-message",
      lines: [
        "  // 3. La demande devient un événement envoyé à la session.",
        "  await client.beta.sessions.events.send(session.id, {",
        '    events: [{ type: "user.message", content: [{ type: "text", text: message }] }],',
        "  });",
        "",
      ],
    },
    {
      id: "loop",
      lines: [
        "  // 4. Tout ce que fait la session arrive ici, événement par événement.",
        '  let answer = "";',
        "  for await (const event of stream) {",
      ],
    },
    {
      id: "on-message",
      lines: [
        '    if (event.type === "agent.message") {',
        "      for (const block of event.content) {",
        '        if (block.type === "text") answer += block.text;',
        "      }",
        "    }",
        "",
      ],
    },
    {
      id: "on-tool",
      lines: [
        "    // 5. L'agent réclame un outil : la session s'arrête et t'attend.",
        '    if (event.type === "agent.custom_tool_use") {',
      ],
    },
    {
      id: "run-tool",
      lines: [
        "      // C'est ton code qui agit, avec tes accès. L'agent n'y touche pas.",
        "      const result = await replyToTicket(event.input.ticket);",
        "",
      ],
    },
    {
      id: "send-result",
      lines: [
        "      // 6. Tu renvoies le résultat : la session reprend.",
        "      await client.beta.sessions.events.send(session.id, {",
        "        events: [",
        "          {",
        '            type: "user.custom_tool_result",',
        "            custom_tool_use_id: event.id,",
        '            content: [{ type: "text", text: result }],',
        "          },",
        "        ],",
        "      });",
        "    }",
        "",
      ],
    },
    {
      id: "on-idle",
      lines: [
        "    // 7. « idle » sans action attendue de toi : le tour est fini.",
        '    if (event.type === "session.status_idle" && event.stop_reason.type !== "requires_action") {',
        "      break;",
        "    }",
        "  }",
        "",
      ],
    },
    {
      id: "respond",
      lines: ["  return Response.json({ success: true, data: { answer }, error: null });", "}"],
    },
  ],
};

const ROUTE = BACKEND_FILE.name;

/**
 * La session : une exécution de l'agent. On suit une demande du début à la fin,
 * de la route de ton backend jusqu'à la réponse, événement par événement.
 */
export const SESSION_LESSON: Lesson = {
  id: "session",
  title: "La session",
  summary: "Une exécution de l'agent : ton backend l'ouvre, lui écrit, et lit ce qu'elle produit.",
  before: { adds: ["agent", "room", "bench", "bed"] },
  files: [BACKEND_FILE],
  steps: [
    {
      id: "what",
      title: "Une session, c'est une exécution",
      text: [
        "Un agent et un environnement ne font rien tant qu'on ne les lance pas : l'agent dort.",
        "Une session, c'est une exécution : cet agent, dans un conteneur neuf, pour une conversation.",
        "C'est ton backend qui l'ouvre, qui lui écrit, et qui lit ce qu'elle produit. Suivons une demande du début à la fin.",
      ],
      code: { file: ROUTE, blocks: ["imports"] },
    },
    {
      id: "request",
      title: "Une demande arrive chez toi",
      text: [
        "Dans ton interface, quelqu'un écrit : « Réponds au ticket d'Alice. »",
        "Ton interface appelle ta route. Rien n'a encore touché Managed Agents : l'agent dort toujours.",
      ],
      code: { file: ROUTE, blocks: ["route"] },
    },
    {
      id: "session",
      title: "Ton backend ouvre une session",
      text: [
        "Une session, c'est une exécution de l'agent, dans un conteneur neuf.",
        "La pile à côté de lui est sa fenêtre de contexte. Elle contient déjà ses consignes et la définition de ses outils : c'est tout ce qu'il sait.",
      ],
      code: { file: ROUTE, blocks: ["create-session"] },
      adds: ["context"],
      actions: [{ type: "newSession", budgetCents: null, context: AGENT_SETUP }],
    },
    {
      id: "stream",
      title: "Il ouvre le flux d'événements",
      text: [
        "Avant d'écrire à la session, ton backend ouvre son flux d'événements.",
        "Tout ce que fera la session lui arrivera par là, dans l'ordre. L'ouvrir d'abord évite de manquer le début.",
      ],
      code: { file: ROUTE, blocks: ["open-stream"] },
    },
    {
      id: "message",
      title: "Il envoie le message",
      text: [
        "La demande part comme un événement « user.message ». Elle entre dans la pièce par la gauche : c'est ton backend qui parle.",
        "L'agent se réveille. Le message s'ajoute à sa pile, et le modèle la relit en entier pour décider quoi faire.",
      ],
      code: { file: ROUTE, blocks: ["send-message"] },
      actions: [
        hop("app", "agent", "user.message", "entry"),
        event("user.message", "Réponds au ticket d'Alice.", "app"),
        event("session.status_running", "l'agent se met au travail", "session"),
        { type: "status", status: "running" },
        { type: "mood", mood: "thinking" },
        { type: "move", to: AGENT_DESK, durationMs: WALK_MS },
        { type: "modelRequest" },
      ],
    },
    {
      id: "tool-call",
      title: "L'agent demande un outil",
      text: [
        "Le modèle a décidé : il lui faut l'outil « reply_ticket ». Il ne l'exécute pas, il le demande.",
        "L'événement « agent.custom_tool_use » sort de la pièce vers ton backend, et la session s'arrête : « idle », dans l'attente d'une action de ta part.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-tool"] },
      actions: [
        hop("agent", "app", "reply_ticket", "call"),
        event("agent.custom_tool_use", 'reply_ticket({"ticket":1})', "agent"),
        event("session.status_idle", "requires_action : la session attend ton backend", "session"),
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "run-tool",
      title: "Ton backend exécute l'outil",
      text: [
        "Ton backend appelle une fonction à toi, avec tes accès à ta base et à ta boîte de support.",
        "Rien de tout cela ne passe par la pièce. L'agent ne voit ni ton code ni tes identifiants : il attend.",
      ],
      code: { file: ROUTE, blocks: ["run-tool"] },
      actions: [hop("app", "desk", "ton code répond à Alice", "effect")],
    },
    {
      id: "result",
      title: "Il renvoie le résultat",
      text: [
        "Ton backend renvoie le résultat avec « user.custom_tool_result », en citant l'identifiant de l'appel.",
        "Le résultat s'ajoute à la pile, la session reprend, et le modèle relit tout pour décider de la suite.",
      ],
      code: { file: ROUTE, blocks: ["send-result"] },
      actions: [
        hop("app", "agent", "résultat", "result"),
        event("user.custom_tool_result", "Réponse envoyée à Alice.", "app"),
        event("session.status_running", "l'agent reprend", "session"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "L'agent conclut",
      text: [
        "Le modèle n'a plus besoin d'outil : il écrit sa réponse, que ton backend lit dans le flux.",
        "La session repasse « idle », cette fois sans rien attendre de toi : le tour est fini, et ta route répond à ton interface.",
      ],
      code: { file: ROUTE, blocks: ["on-message", "on-idle", "respond"] },
      actions: [
        { type: "bubble", text: "C'est réglé : j'ai répondu à Alice." },
        event("agent.message", "C'est réglé : j'ai répondu à Alice.", "agent"),
        event("session.status_idle", "end_turn : le tour est terminé", "session"),
        { type: "status", status: "idle" },
        { type: "mood", mood: "idle" },
      ],
    },
    {
      id: "recap",
      title: "Ce que tu viens de brancher",
      text: [
        "Quatre appels suffisent : ouvrir une session, ouvrir son flux, envoyer un message, et répondre quand l'agent réclame un outil.",
        "L'agent décide dans sa pièce ; ton backend agit dehors. Entre les deux, il n'y a que des événements.",
        "Il reste une brique à voir : le vault, pour les services que l'agent appelle sans passer par toi.",
      ],
      code: { file: ROUTE, blocks: ["create-session", "open-stream", "send-message", "send-result"] },
      actions: [
        { type: "bubble", text: null },
        { type: "move", to: AGENT_HOME, durationMs: WALK_MS },
      ],
    },
  ],
};
