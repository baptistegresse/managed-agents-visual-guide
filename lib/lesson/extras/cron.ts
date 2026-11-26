import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../types";
import { agentReply, asksBackend, BACK_TO_BED, backendAnswers, openingStep, PREVIOUS_TURN, WAKE_UP } from "./shared";

const DEPLOY_FILE: CodeFile = {
  name: "deploy.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { AGENT_ID, ENVIRONMENT_ID, VAULT_ID } from "./config";',
        "",
        "const client = new Anthropic();",
        "",
      ],
    },
    {
      id: "deployment",
      lines: [
        "// À lancer une fois. Ensuite, l'horloge tourne chez Anthropic.",
        "const deployment = await client.beta.deployments.create({",
        '  name: "Point du matin",',
        "  agent: AGENT_ID,",
        "  environment_id: ENVIRONMENT_ID,",
        "  vault_ids: [VAULT_ID],",
      ],
    },
    {
      id: "initial-events",
      lines: [
        "  // Le message que chaque nouvelle session reçoit en s'ouvrant.",
        "  initial_events: [",
        "    {",
        '      type: "user.message",',
        '      content: [{ type: "text", text: "Fais le point du matin sur les tickets en attente." }],',
        "    },",
        "  ],",
      ],
    },
    {
      id: "schedule",
      lines: [
        "  // Un horaire cron : tous les jours à 9 h, heure de Paris.",
        '  schedule: { type: "cron", expression: "0 9 * * *", timezone: "Europe/Paris" },',
        "});",
        "",
        "await saveIds({ deploymentId: deployment.id });",
      ],
    },
  ],
};

const NOTICE_FILE: CodeFile = {
  name: "app/api/webhooks/anthropic/route.ts",
  blocks: [
    {
      id: "imports",
      lines: [
        'import Anthropic from "@anthropic-ai/sdk";',
        'import { listOpenTickets } from "../../support/support"; // ton code, tes accès',
        "",
        "const client = new Anthropic(); // lit aussi ANTHROPIC_WEBHOOK_SIGNING_KEY",
        "",
      ],
    },
    {
      id: "verify",
      lines: [
        "// Vérifie que l'appel vient bien d'Anthropic, puis lit l'événement.",
        "function readNotice(body: string, headers: Headers) {",
        "  try {",
        "    return client.beta.webhooks.unwrap(body, { headers: Object.fromEntries(headers) });",
        "  } catch {",
        "    return null; // signature absente ou fausse",
        "  }",
        "}",
        "",
      ],
    },
    {
      id: "route",
      lines: [
        "// Anthropic appelle cette adresse quand une de tes sessions change d'état.",
        "export async function POST(request: Request) {",
        "  const notice = readNotice(await request.text(), request.headers);",
        '  if (!notice) return new Response("Signature invalide", { status: 400 });',
        '  if (notice.data.type !== "session.status_idled") return new Response(null, { status: 204 });',
        "",
      ],
    },
    {
      id: "pending",
      lines: [
        "  // L'appel ne porte qu'un identifiant : va lire ce que la session attend.",
        "  const sessionId = notice.data.id;",
        '  const { data: events } = await client.beta.sessions.events.list(sessionId, { order: "desc" });',
        '  const idle = events.find((each) => each.type === "session.status_idle");',
        '  if (idle?.stop_reason.type !== "requires_action") return new Response(null, { status: 204 });',
        "  const pendingIds = idle.stop_reason.event_ids;",
        "",
      ],
    },
    {
      id: "answer",
      lines: [
        "  // Exécute chaque appel en attente et renvoie son résultat : la session reprend.",
        "  for (const each of events) {",
        '    if (each.type !== "agent.custom_tool_use" || !pendingIds.includes(each.id)) continue;',
        "    await client.beta.sessions.events.send(sessionId, {",
        "      events: [",
        "        {",
        '          type: "user.custom_tool_result",',
        "          custom_tool_use_id: each.id,",
        '          content: [{ type: "text", text: await listOpenTickets() }],',
        "        },",
        "      ],",
        "    });",
        "  }",
        "  return new Response(null, { status: 204 });",
        "}",
      ],
    },
  ],
};

const DEPLOY = DEPLOY_FILE.name;
const NOTICE = NOTICE_FILE.name;
const MORNING_MESSAGE = "Fais le point du matin sur les tickets en attente.";
const OPEN_TICKETS = "2 tickets en attente : Bruno (colis en retard), Chloé (remboursement).";

/** Un déploiement planifié : à chaque échéance, Anthropic ouvre une session neuve, sans que ton serveur le demande. */
export const CRON_LESSON: Lesson = {
  id: "cron",
  title: "Une horloge : le déploiement planifié",
  summary: "Un horaire cron ouvre une session neuve à chaque échéance, sans que ton serveur le demande.",
  files: [DEPLOY_FILE, NOTICE_FILE],
  steps: [
    openingStep({
      id: "clock",
      title: "Une horloge à la place de ton backend",
      text: [
        "Jusqu'ici, une session s'ouvrait parce que ton backend le demandait. La pile garde encore l'échange de la leçon principale.",
        "Un déploiement planifié confie ce rôle à une horloge, chez Anthropic : tu lui donnes un agent, un horaire (au format cron) et le message de départ.",
        "Tu lances ce script une fois. Ensuite, ton serveur n'a plus rien à faire pour que l'agent se réveille.",
      ],
      code: { file: DEPLOY, blocks: ["deployment", "initial-events", "schedule"] },
      adds: ["clock"],
      session: { extraToolLines: ["list_open_tickets : liste les tickets restés sans réponse"] },
      actions: PREVIOUS_TURN,
    }),
    {
      id: "firing",
      title: "L'horloge sonne : une session neuve",
      text: [
        "À 9 h, à neuf minutes près au plus, Anthropic ouvre lui-même une nouvelle session et y dépose le message de départ.",
        "Regarde la pile : elle est repartie des consignes et des outils. Rien de la session précédente n'y figure.",
      ],
      code: { file: DEPLOY, blocks: ["initial-events", "schedule"] },
      actions: [
        { type: "entry", point: "cron" },
        { type: "freshSession" },
        hop("cron", "agent", "user.message", "entry"),
        event("user.message", MORNING_MESSAGE, "entry"),
        ...WAKE_UP,
      ],
    },
    {
      id: "nobody",
      title: "L'agent demande un outil, et personne n'écoute",
      text: [
        "L'agent demande « list_open_tickets », un outil custom : c'est ton backend qui doit l'exécuter.",
        "Mais cette fois, aucune route à toi n'a ouvert le flux. La session attend, et elle attendra tant que personne ne répond.",
      ],
      code: { file: NOTICE, blocks: ["imports"] },
      actions: asksBackend("list_open_tickets({})"),
    },
    {
      id: "notice",
      title: "Anthropic prévient ton serveur",
      text: [
        "Dans la Console, abonne une route de ton serveur aux webhooks d'Anthropic : il l'appelle quand une session passe « idle ».",
        "L'appel ne porte que l'identifiant de la session. Ta route vérifie la signature, puis lit les événements pour retrouver l'appel d'outil en attente.",
      ],
      code: { file: NOTICE, blocks: ["verify", "route", "pending"] },
      actions: [hop("agent", "app", "webhook : session.status_idled", "call")],
    },
    {
      id: "answer",
      title: "Ton backend répond, la session reprend",
      text: [
        "Ta route exécute l'outil et renvoie « user.custom_tool_result », comme dans la leçon principale.",
        "La session reprend là où elle s'était arrêtée.",
      ],
      code: { file: NOTICE, blocks: ["answer"] },
      actions: [hop("app", "agent", "résultat", "result"), ...backendAnswers(OPEN_TICKETS)],
    },
    {
      id: "done",
      title: "Demain, une autre session",
      text: [
        "L'agent écrit son point du matin, et la session repasse « idle ».",
        "Demain à 9 h, l'horloge ouvrira une autre session, avec une pile neuve : elle ne saura rien de celle-ci.",
      ],
      code: { file: DEPLOY, blocks: ["schedule"] },
      actions: [...agentReply("Point du matin : deux tickets attendent, ceux de Bruno et de Chloé."), ...BACK_TO_BED],
    },
  ],
};
