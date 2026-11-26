import type { ToolId } from "@/lib/workshop/catalog";
import { THREAD_PREFIX } from "@/lib/workshop/context";
import { event, type Effect } from "@/lib/workshop/effects";
import { THREAD_SPOTS } from "@/lib/workshop/layout";
import { hop, type CodeFile, type Lesson } from "../types";
import {
  agentReply,
  BACK_TO_BED,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  replyTicketCall,
  ROUTE,
  SETUP,
  SETUP_HEAD,
  userMessage,
  WALK_MS,
} from "./shared";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "agent",
      lines: [
        "const agent = await client.beta.agents.create({",
        '  name: "Assistant support",',
        '  model: "claude-haiku-5-5",',
        '  system: "Tu réponds aux clients du support.",',
        "  tools: [REPLY_TICKET_TOOL],",
      ],
    },
    {
      id: "multiagent",
      lines: [
        "  // L'agent peut confier une partie du travail à des copies de lui-même.",
        "  multiagent: {",
        '    type: "multiagent_20261001",',
        "    subagents: {",
        '      type: "enabled",',
        '      predefined_agents: [{ type: "self" }], // des copies de lui-même',
        "      // Sans cette ligne, il pourrait aussi inventer d'autres agents sur le moment.",
        '      inline_agents: { type: "disabled" },',
        "    },",
        '    workflows: { type: "disabled" },',
        "  },",
        "});",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    LOOP_OPEN,
    {
      id: "on-thread",
      lines: [
        "    // Pour suivre le travail : une copie ouvre son fil, puis s'arrête.",
        "    // Son stop_reason dit si elle a fini, ou si elle attend ton backend.",
        '    if (event.type === "session.thread_created" || event.type === "session.thread_status_idle") {',
        "      logStep(event.type, event.session_thread_id);",
        "    }",
        "    // Le compte rendu d'une copie à l'agent passe par un message, d'un fil à l'autre.",
        '    if (event.type === "agent.thread_message_received") {',
        "      logStep(event.type, event.from_session_thread_id);",
        "    }",
        "",
      ],
    },
    {
      id: "on-tool",
      lines: [
        "    // L'appel d'une copie arrive ici, comme celui de l'agent.",
        '    if (event.type === "agent.custom_tool_use") {',
        "      // session_thread_id dit quelle copie demande.",
        "      logStep(event.name, event.session_thread_id);",
        "      const result = await replyToTicket(event.input.ticket);",
        "",
      ],
    },
    {
      id: "send-result",
      lines: [
        "      // La réponse ne change pas : l'identifiant de l'appel suffit à la router.",
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
    LOOP_CLOSE,
  ],
};

interface Copy {
  readonly id: number;
  readonly customer: string;
  readonly ticket: number;
}

const COPIES: readonly Copy[] = [
  { id: 1, customer: "Alice", ticket: 1 },
  { id: 2, customer: "Bruno", ticket: 2 },
];

/** Ce qui se passe dans le fil d'une copie porte ce préfixe : la pile de l'agent ne le reçoit pas. */
function inThread(copy: Copy, detail: string): string {
  return `${THREAD_PREFIX} ${copy.id}] ${detail}`;
}

/** Une copie par fil, debout dans la pièce, avec ou sans outil en main. */
function copiesInRoom(carrying: ToolId | null): Effect {
  return {
    type: "helpers",
    helpers: COPIES.map((copy, index) => ({ id: copy.id, position: THREAD_SPOTS[index], moveMs: WALK_MS, carrying })),
  };
}

/** L'agent confie une partie du travail à des copies de lui-même : chacune a son fil et sa pile. */
export const DELEGATION_LESSON: Lesson = {
  id: "delegation",
  title: "Déléguer à des copies",
  summary: "L'agent partage le travail entre des copies de lui-même, chacune avec son fil et sa pile.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "multiagent",
      title: "Un agent, plusieurs fils",
      text: [
        "Un agent traite ses tâches une par une, dans une seule pile.",
        "Avec « multiagent », il peut confier une partie du travail à des copies de lui-même. Tu l'actives dans la configuration de l'agent.",
        "Ton backend, lui, ne change presque pas.",
      ],
      code: { file: SETUP, blocks: ["multiagent"] },
      session: { extraToolLines: ["list_agents, send_to_agent : voir les agents disponibles et leur écrire (ajoutés par « multiagent »)"] },
    }),
    {
      id: "spawn",
      title: "L'agent partage le travail",
      text: [
        "Ton backend demande de répondre à Alice et à Bruno. L'agent ouvre deux copies de lui-même, et confie un ticket à chacune.",
        "Chaque copie a son propre fil (un « thread ») et sa propre pile.",
        "Elle ne voit pas la pile de l'agent : seulement la tâche qu'il lui a confiée.",
      ],
      code: { file: ROUTE, blocks: ["on-thread"] },
      actions: [
        ...userMessage("Réponds aux tickets d'Alice et de Bruno."),
        ...COPIES.flatMap((copy) => [
          event("session.thread_created", `copie ${copy.id} : un fil et une pile rien qu'à elle`, "session"),
          event("agent.thread_message_sent", `à la copie ${copy.id} : réponds au ticket de ${copy.customer}`, "agent"),
        ]),
        copiesInRoom(null),
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "calls",
      title: "Les copies demandent leur outil à ton backend",
      text: [
        "Chaque copie demande « reply_ticket ». Ces appels arrivent dans le flux de la session, celui que ton backend lit déjà.",
        "Un champ en plus, « session_thread_id », dit quelle copie demande.",
        "Chaque fil s'arrête pour attendre (« session.thread_status_idle »), puis la session entière : « session.status_idle », comme d'habitude.",
      ],
      code: { file: ROUTE, blocks: ["on-tool"] },
      actions: [
        ...COPIES.map((copy) => event("agent.custom_tool_use", inThread(copy, replyTicketCall(copy.ticket)), "agent")),
        ...COPIES.map((copy) =>
          event("session.thread_status_idle", `copie ${copy.id} : requires_action, elle attend ton backend`, "session"),
        ),
        event("session.status_idle", "requires_action : deux appels attendent ton backend", "session"),
        copiesInRoom("reply_ticket"),
        hop("agent", "app", "reply_ticket × 2", "call"),
      ],
    },
    {
      id: "results",
      title: "Ton backend répond comme avant",
      text: [
        "Ton backend exécute les deux appels et renvoie deux « user.custom_tool_result ».",
        "Il cite l'identifiant de chaque appel, rien de plus : Anthropic remet chaque résultat à la bonne copie.",
      ],
      code: { file: ROUTE, blocks: ["send-result"] },
      actions: [
        hop("app", "agent", "résultats", "result"),
        ...COPIES.map((copy) =>
          event("user.custom_tool_result", inThread(copy, `Réponse envoyée à ${copy.customer}.`), "app"),
        ),
        event("session.status_running", "les copies reprennent", "session"),
        copiesInRoom(null),
      ],
    },
    {
      id: "report",
      title: "Les copies rendent compte",
      text: [
        "Chaque copie envoie son compte rendu à l'agent : « agent.thread_message_received ». Son fil s'arrête aussi, cette fois avec « end_turn » : l'ordre entre les deux n'est pas garanti.",
        "Seul ce compte rendu rejoint la pile de l'agent. Le détail du travail de la copie reste dans son fil.",
        "C'est tout l'intérêt : la pile principale reste courte.",
      ],
      code: { file: ROUTE, blocks: ["on-thread"] },
      actions: [
        ...COPIES.flatMap((copy) => [
          event("agent.thread_message_received", `copie ${copy.id} : le ticket de ${copy.customer} est traité`, "agent"),
          event("session.thread_status_idle", `copie ${copy.id} : end_turn, elle a fini`, "session"),
        ]),
        { type: "helpers", helpers: [] },
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
        ...agentReply("C'est réglé : Alice et Bruno ont leur réponse."),
      ],
    },
    {
      id: "done",
      title: "Ce qui change pour ton backend",
      text: [
        "Presque rien : les appels d'outils des copies arrivent au même endroit, et tu y réponds de la même façon.",
        "Ce qui change est dans la pièce : plusieurs piles au lieu d'une, et un travail mené en parallèle.",
      ],
      code: { file: SETUP, blocks: ["multiagent"] },
      actions: BACK_TO_BED,
    },
  ],
};
