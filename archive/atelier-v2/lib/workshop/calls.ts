import type { GridPoint } from "@/lib/iso/projection";
import { toolSpec, type KeyId, type ToolId } from "./catalog";
import { applyTool, ticketById, type Applied, type Desk, type ToolInput } from "./desk";
import { event, RESUMED, speech, type ApprovalRequest, type Beat, type Effect, type Hop, type Place, type Step } from "./effects";
import { BRIDGE_MIDDLE, ORDERS_STAND, rackStand, tileStand, travelMs } from "./layout";
import type { Continue, Progress } from "./progress";

/** Le temps qu'un appel met à traverser d'une zone à l'autre. */
export const HOP_MS = 700;
const PICK_MS = 380;
const KEY_MS = 900;
/** Le temps que la plateforme met à trouver l'identifiant dans le vault. */
const KEY_CHECK_MS = 500;
const WORK_MS = 420;
const SERVICE_MS = 800;
const SETTLE_MS = 600;
const CONFIRM_MS = 300;

export const NO_HOP: Effect = { type: "hop", hop: null };

export function hop(from: Place, to: Place, label: string, tone: Hop["tone"]): Effect {
  return { type: "hop", hop: { from, to, label, tone } };
}

export interface PlayedCall {
  readonly beats: readonly Beat[];
  readonly progress: Progress;
}

/**
 * Le trajet du code de ton application : il ne passe de chez toi à la boîte de
 * support, et inversement, que par la passerelle. `first` s'applique en partant.
 */
export function workerWalk(from: GridPoint, to: GridPoint, first: readonly Effect[] = []): Beat[] {
  const isCrossing = from.x < BRIDGE_MIDDLE.x !== to.x < BRIDGE_MIDDLE.x;
  const stops = isCrossing ? [BRIDGE_MIDDLE, to] : [to];
  return stops.map((stop, index) => {
    const durationMs = travelMs(index === 0 ? from : stops[index - 1], stop);
    return {
      durationMs,
      effects: [...(index === 0 ? first : []), { type: "move", who: "worker", to: stop, durationMs }],
    };
  });
}

/** L'emplacement du ticket visé : c'est là que se rend celui qui exécute l'outil. */
export function ticketStand(desk: Desk, input: ToolInput): GridPoint {
  const ticket = ticketById(desk, input.ticket);
  return tileStand(ticket?.x ?? 0, ticket?.y ?? 0);
}

/**
 * Un outil custom : l'agent ne fait qu'émettre l'appel. La session s'arrête, ton
 * application l'exécute (son code prend l'outil, puis va agir sur le ticket ou
 * interroger sa base de commandes), et renvoie le résultat. L'agent, lui, ne
 * quitte pas la session.
 */
export function playAppCall(progress: Progress, tool: ToolId, input: ToolInput, keys: readonly KeyId[]): PlayedCall {
  const stand = rackStand(tool);
  const isQuery = toolSpec(tool).target === "orders";
  const target = isQuery ? ORDERS_STAND : ticketStand(progress.desk, input);
  const applied = applyTool(progress.desk, { tool, input }, keys);
  const { text, isError } = applied.result;
  // Devant sa base, ton code l'interroge ; sur la planche, il agit sur le ticket.
  const work: Beat = isQuery
    ? { durationMs: HOP_MS, effects: [hop("app", "orders", "requête", "call")] }
    : { durationMs: WORK_MS, effects: [] };

  const beats: Beat[] = [
    {
      durationMs: HOP_MS,
      effects: [
        { type: "bubble", text: null },
        event("agent.custom_tool_use", `${tool}(${JSON.stringify(input)})`, "agent"),
        event("session.status_idle", "requires_action : la session attend ton application", "session"),
        { type: "mood", mood: "waiting" },
        hop("agent", "app", tool, "call"),
      ],
    },
    ...workerWalk(progress.workerAt, stand, [NO_HOP]),
    { durationMs: PICK_MS, effects: [{ type: "carry", who: "worker", tool }] },
    ...workerWalk(stand, target),
    work,
    {
      durationMs: SETTLE_MS,
      isModelRequest: true,
      effects: [
        { type: "desk", desk: applied.desk },
        { type: "carry", who: "worker", tool: null },
        event("user.custom_tool_result", text, "app", isError),
        RESUMED,
        { type: "mood", mood: "thinking" },
        hop("app", "agent", "résultat", isError ? "error" : "result"),
      ],
    },
    { durationMs: 0, effects: [NO_HOP] },
    ...(isError ? [speech(`Raté : ${text}`)] : []),
  ];
  return { beats, progress: { ...progress, desk: applied.desk, workerAt: target } };
}

/** Un appel à un service tiers, avec tout ce qu'il faut pour le jouer. */
interface ServiceCall {
  readonly tool: ToolId;
  readonly input: ToolInput;
  readonly key: KeyId;
  readonly service: Place;
  readonly applied: Applied;
}

/** Ce que tu lis avant de donner ton accord : l'outil, et ce qu'il s'apprête à faire. */
function approvalRequest(call: ServiceCall, desk: Desk): ApprovalRequest {
  const ticket = ticketById(desk, call.input.ticket);
  const what = ticket && ticket.amount !== null ? `${ticket.amount} € pour ${ticket.customer}` : `ticket ${call.input.ticket}`;
  return { tool: `MCP ${call.key}`, target: `${call.tool} · ${what}` };
}

/** Sans identifiant dans le vault, l'appel s'arrête là : il n'atteint jamais le service. */
function refusedAtVault(call: ServiceCall): Beat[] {
  const { text } = call.applied.result;
  return [
    { durationMs: KEY_MS, effects: [{ type: "key", key: call.key, isDenied: true }, NO_HOP] },
    {
      durationMs: SETTLE_MS,
      isModelRequest: true,
      effects: [
        { type: "key", key: null, isDenied: false },
        event("agent.mcp_tool_result", text, "mcp", true),
        { type: "mood", mood: "thinking" },
        hop("vault", "agent", "refusé", "error"),
      ],
    },
    { durationMs: 0, effects: [NO_HOP] },
    speech(`Impossible : ${text}`),
  ];
}

/** L'appel part du vault avec son identifiant, le service agit, puis le résultat revient à l'agent. */
function throughService(call: ServiceCall, desk: Desk): Beat[] {
  const { text, isError } = call.applied.result;
  const ticket = ticketById(desk, call.input.ticket);
  // Un remboursement change quelque chose chez le client ; un suivi de colis ne fait que lire.
  const effect =
    call.tool === "create_refund" && !isError && ticket
      ? [hop(call.service, "desk", `${ticket.amount} € remboursés`, "effect")]
      : [NO_HOP];
  return [
    { durationMs: KEY_MS, effects: [hop("vault", call.service, "+ identifiant", "call")] },
    { durationMs: SERVICE_MS, effects: [{ type: "key", key: null, isDenied: false }, ...effect] },
    {
      durationMs: SETTLE_MS,
      isModelRequest: true,
      effects: [
        { type: "desk", desk: call.applied.desk },
        event("agent.mcp_tool_result", text, "mcp", isError),
        { type: "mood", mood: "thinking" },
        hop(call.service, "agent", "résultat", isError ? "error" : "result"),
      ],
    },
    { durationMs: 0, effects: [NO_HOP] },
    ...(isError ? [speech(`Raté : ${text}`)] : []),
  ];
}

/** L'outil est en « always_ask » : la session s'arrête au vault et attend ta décision. */
function approvalGate(call: ServiceCall, progress: Progress, next: Continue, abandon: Continue): Step {
  return {
    gate: "approval",
    ask: {
      durationMs: 0,
      effects: [
        event("session.status_idle", "requires_action : cet appel attend ton accord", "session"),
        { type: "approval", request: approvalRequest(call, progress.desk) },
      ],
    },
    allow: [
      {
        durationMs: CONFIRM_MS,
        effects: [{ type: "approval", request: null }, event("user.tool_confirmation", "allow", "app"), RESUMED],
      },
      ...throughService(call, progress.desk),
      ...next({ ...progress, desk: call.applied.desk }),
    ],
    deny: [
      {
        durationMs: CONFIRM_MS,
        isModelRequest: true,
        effects: [
          { type: "approval", request: null },
          { type: "key", key: null, isDenied: false },
          event("user.tool_confirmation", "deny", "app"),
          event("agent.mcp_tool_result", "Permission refusée.", "mcp", true),
          RESUMED,
          { type: "mood", mood: "thinking" },
        ],
      },
      speech("Tu as refusé : je n'appelle pas le service."),
      ...abandon(progress),
    ],
  };
}

/**
 * Un outil d'un service tiers, branché en MCP : la plateforme l'appelle elle-même,
 * sans passer par ton application. Elle prend l'identifiant dans le vault au
 * passage ; s'il manque, l'appel échoue là. Si l'outil demande ton accord, la
 * session t'attend avant que l'appel ne quitte le vault ; `abandon` est la fin
 * du tour quand tu refuses.
 */
export function playServiceCall(
  progress: Progress,
  request: { readonly tool: ToolId; readonly input: ToolInput },
  keys: readonly KeyId[],
  next: Continue,
  abandon: Continue,
): Step[] {
  const spec = toolSpec(request.tool);
  const key = spec.requiresKey;
  if (key === null) throw new Error(`L'outil ${request.tool} n'appartient à aucun service tiers.`);
  const call: ServiceCall = { ...request, key, service: `service:${key}`, applied: applyTool(progress.desk, request, keys) };

  const emitted: Beat = {
    durationMs: HOP_MS,
    effects: [
      { type: "bubble", text: null },
      event("agent.mcp_tool_use", `${key}.${call.tool}(${JSON.stringify(call.input)})`, "agent"),
      { type: "mood", mood: "waiting" },
      hop("agent", "vault", call.tool, "call"),
    ],
  };
  if (!keys.includes(key)) {
    return [emitted, ...refusedAtVault(call), ...next({ ...progress, deniedTools: [...progress.deniedTools, call.tool] })];
  }
  const found: Beat = { durationMs: KEY_CHECK_MS, effects: [{ type: "key", key, isDenied: false }, NO_HOP] };
  if (spec.needsApproval) return [emitted, found, approvalGate(call, progress, next, abandon)];
  return [emitted, found, ...throughService(call, progress.desk), ...next({ ...progress, desk: call.applied.desk })];
}
