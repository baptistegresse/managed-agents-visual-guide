import { hop, type CodeFile, type Lesson } from "../types";
import {
  agentReply,
  asksBackend,
  BACK_TO_BED,
  backendAnswers,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  replyTicketCall,
  ROUTE,
  userMessage,
} from "./shared";

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    LOOP_CLOSE,
    {
      id: "resume",
      lines: [
        "",
        "// Au redémarrage de ton serveur : reprendre l'écoute d'une session en cours.",
        "export async function resumeListening(sessionId: string) {",
      ],
    },
    {
      id: "reopen",
      lines: [
        "  // 1. Rouvre le flux d'abord. Il ne rejoue rien : il ne donne que la suite.",
        "  const stream = await client.beta.sessions.events.stream(sessionId);",
        "",
      ],
    },
    {
      id: "history",
      lines: [
        "  // 2. Relis l'historique : Anthropic a gardé chaque événement, coupure comprise.",
        "  const history = await Array.fromAsync(client.beta.sessions.events.list(sessionId));",
        "",
      ],
    },
    {
      id: "pending",
      lines: [
        "  // 3. Réponds aux appels d'outil restés sans résultat, et à eux seulement.",
        "  const answered = new Set(",
        '    history.flatMap((event) => (event.type === "user.custom_tool_result" ? [event.custom_tool_use_id] : [])),',
        "  );",
        "  for (const event of history) {",
        '    if (event.type === "agent.custom_tool_use" && !answered.has(event.id)) {',
        "      await runToolAndSendResult(sessionId, event);",
        "    }",
        "  }",
        "",
      ],
    },
    {
      id: "dedupe",
      lines: [
        "  // 4. Reprends le direct. Un événement peut arriver par les deux chemins :",
        "  //    son identifiant sert à ne pas le traiter deux fois.",
        "  const seen = new Set(history.map((event) => event.id));",
        "  for await (const event of stream) {",
        "    if (!seen.has(event.id)) await handle(sessionId, event);",
        '    if (event.type === "session.status_idle" && event.stop_reason.type !== "requires_action") break;',
        "  }",
        "}",
      ],
    },
  ],
};

/** Le flux tombe, la session continue : au retour, l'historique rend ce que le flux ne rejoue pas. */
export const RESUME_LESSON: Lesson = {
  id: "resume",
  title: "Reprendre après une coupure",
  summary: "Ton serveur redémarre en plein tour : la session continue, et l'historique rend ce que tu as manqué.",
  files: [ROUTE_FILE],
  steps: [
    openingStep({
      id: "risk",
      title: "Le flux peut tomber, pas la session",
      text: [
        "Le flux d'événements est une connexion ouverte entre ton backend et Anthropic. Elle peut tomber : un déploiement, un redémarrage, une coupure réseau.",
        "La session, elle, ne vit pas chez toi. Elle continue, que quelqu'un l'écoute ou non.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-idle"] },
    }),
    {
      id: "working",
      title: "Un tour commence normalement",
      text: [
        "Ton backend envoie « Réponds au ticket d'Alice. », et écoute le flux.",
        "L'agent se lève et relit sa pile.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: userMessage("Réponds au ticket d'Alice."),
    },
    {
      id: "cut",
      title: "Ton serveur redémarre en plein tour",
      text: [
        "La connexion tombe. L'agent ne s'en aperçoit pas : il demande « reply_ticket », et la session passe « idle » en attendant le résultat.",
        "Personne n'a entendu la demande. Tant qu'on ne lui répond pas, la session reste là, à attendre.",
      ],
      code: { file: ROUTE, blocks: ["loop"] },
      actions: [...asksBackend(replyTicketCall(1)), hop("agent", "app", "flux coupé", "error")],
    },
    {
      id: "no-replay",
      title: "Rouvrir le flux ne suffit pas",
      text: [
        "Ton serveur est revenu, et rouvre le flux. Mais un flux ne rejoue rien : il ne donne que les événements à venir.",
        "La demande d'outil a été émise pendant la coupure. Elle ne repassera pas : se contenter d'écouter, c'est attendre pour rien.",
      ],
      code: { file: ROUTE, blocks: ["resume", "reopen"] },
    },
    {
      id: "history",
      title: "L'historique, lui, a tout gardé",
      text: [
        "Anthropic conserve chaque événement de la session. « events.list » les rend tous, coupure comprise.",
        "Ton backend y retrouve la demande d'outil, et voit qu'aucun résultat ne l'a suivie. C'est celle-là qu'il doit traiter.",
      ],
      code: { file: ROUTE, blocks: ["history", "pending"] },
      actions: [hop("agent", "app", "events.list : l'historique", "result")],
    },
    {
      id: "answered",
      title: "La session repart de là où elle attendait",
      text: [
        "Ton backend exécute l'outil et renvoie le résultat. La session repart, et l'agent conclut : rien n'a été perdu.",
        "Puis il écoute à nouveau le direct. Un événement peut arriver par l'historique et par le flux : son identifiant évite de le traiter deux fois.",
        "Fais-le à chaque connexion, pas seulement après une panne. C'est ce qui rend ton backend redémarrable.",
      ],
      code: { file: ROUTE, blocks: ["pending", "dedupe"] },
      actions: [
        ...backendAnswers("Réponse envoyée à Alice."),
        ...agentReply("C'est réglé : j'ai répondu à Alice."),
        ...BACK_TO_BED,
      ],
    },
  ],
};
