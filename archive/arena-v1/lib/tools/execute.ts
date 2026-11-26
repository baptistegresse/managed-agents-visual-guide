import { z } from "zod";
import { CODE_BY_COLOR } from "@/lib/config";
import {
  boundingBox,
  clampRegion,
  countConflicts,
  countPixelsInRegion,
  rectToCells,
  renderRegion,
} from "@/lib/world/canvas";
import type { Approval, PaintCell, World } from "@/lib/world/types";
import {
  activeSlots,
  addApproval,
  addChatMessage,
  applyPaint,
  describeConflicts,
  findTenant,
  isActive,
  logActivity,
  patchTenant,
  removeApproval,
} from "@/lib/world/world";
import {
  COLOR_LEGEND,
  lookAtCanvasInput,
  paintPixelsInput,
  paintRectInput,
  postChatMessageInput,
} from "./definitions";

export interface ToolCall {
  readonly slot: number;
  readonly toolUseId: string;
  readonly name: string;
  readonly input: unknown;
}

export type ToolOutcome =
  | { readonly kind: "done"; readonly world: World; readonly text: string; readonly isError: boolean }
  | { readonly kind: "needs_approval"; readonly world: World; readonly approvalId: string };

export type ApprovalDecision = "allow" | "deny" | "timeout";

export interface ResolvedApproval {
  readonly world: World;
  readonly slot: number;
  readonly text: string;
  readonly isError: boolean;
}

function fail(world: World, text: string): ToolOutcome {
  return { kind: "done", world, text, isError: true };
}

function invalidInput(world: World, error: z.ZodError): ToolOutcome {
  return fail(world, `Paramètres invalides :\n${z.prettifyError(error)}`);
}

/** Peint tout de suite si la zone est libre, sinon met l'appel en attente du modérateur. */
function paint(world: World, call: ToolCall, cells: readonly PaintCell[], now: number): ToolOutcome {
  const box = boundingBox(cells);
  if (!box) return fail(world, "Rien à peindre : la zone est hors du canvas.");

  const conflicts = countConflicts(world.canvas, cells, call.slot, activeSlots(world));
  const name = findTenant(world, call.slot)?.name ?? "?";

  if (conflicts.length === 0) {
    const painted = applyPaint(world, call.slot, cells);
    const logged = logActivity(
      painted,
      { slot: call.slot, source: "server", text: `${name} peint ${cells.length} px (${call.name})` },
      now,
    );
    return { kind: "done", world: logged, text: `Peint : ${cells.length} pixels.`, isError: false };
  }

  const approval: Approval = {
    id: call.toolUseId,
    slot: call.slot,
    tool: call.name,
    cells,
    conflicts,
    box,
    createdAt: now,
  };
  const held = patchTenant(addApproval(world, approval), call.slot, { status: "awaiting_approval" });
  const logged = logActivity(
    held,
    {
      slot: call.slot,
      source: "server",
      text: `${name} veut repeindre ${describeConflicts(held, approval)} : en attente du modérateur`,
    },
    now,
  );
  return { kind: "needs_approval", world: logged, approvalId: approval.id };
}

function lookAtCanvas(world: World, input: z.infer<typeof lookAtCanvasInput>): ToolOutcome {
  const { size } = world.canvas;
  const x = input.x ?? 0;
  const y = input.y ?? 0;
  const region = clampRegion(
    { x, y, width: input.width ?? size - x, height: input.height ?? size - y },
    size,
  );
  const painters = [...countPixelsInRegion(world.canvas, region).entries()]
    .map(([slot, count]) => `${findTenant(world, slot)?.name ?? "?"} (${count} px)`)
    .join(", ");
  const text = [
    `Zone x ${region.x}–${region.x + region.width - 1}, y ${region.y}–${region.y + region.height - 1}. Légende : .=vide, ${COLOR_LEGEND}`,
    renderRegion(world.canvas, region),
    painters ? `Ont peint ici : ${painters}.` : "Personne n'a encore peint ici.",
  ].join("\n");
  return { kind: "done", world, text, isError: false };
}

export function evaluateToolCall(world: World, call: ToolCall, now: number): ToolOutcome {
  const tenant = findTenant(world, call.slot);
  if (!tenant || !isActive(tenant)) return fail(world, "Cet agent n'est plus actif dans l'arène.");

  switch (call.name) {
    case "paint_pixels": {
      const parsed = paintPixelsInput.safeParse(call.input);
      if (!parsed.success) return invalidInput(world, parsed.error);
      const cells = parsed.data.pixels.map((pixel) => ({
        x: pixel.x,
        y: pixel.y,
        code: CODE_BY_COLOR[pixel.color],
      }));
      return paint(world, call, cells, now);
    }
    case "paint_rect": {
      const parsed = paintRectInput.safeParse(call.input);
      if (!parsed.success) return invalidInput(world, parsed.error);
      const { color, ...region } = parsed.data;
      return paint(world, call, rectToCells(region, CODE_BY_COLOR[color], world.canvas.size), now);
    }
    case "look_at_canvas": {
      const parsed = lookAtCanvasInput.safeParse(call.input);
      if (!parsed.success) return invalidInput(world, parsed.error);
      return lookAtCanvas(world, parsed.data);
    }
    case "post_chat_message": {
      const parsed = postChatMessageInput.safeParse(call.input);
      if (!parsed.success) return invalidInput(world, parsed.error);
      return {
        kind: "done",
        world: addChatMessage(world, call.slot, parsed.data.text, now),
        text: "Message publié.",
        isError: false,
      };
    }
    default:
      return fail(world, `Outil inconnu : ${call.name}`);
  }
}

const REFUSAL_PREFIX: Readonly<Record<Exclude<ApprovalDecision, "allow">, string>> = {
  deny: "Refusé par le modérateur",
  timeout: "Pas de réponse du modérateur à temps, appel refusé",
};

export function resolveApproval(
  world: World,
  approvalId: string,
  decision: ApprovalDecision,
  now: number,
): ResolvedApproval | null {
  const approval = world.approvals.find((candidate) => candidate.id === approvalId);
  if (!approval) return null;

  const name = findTenant(world, approval.slot)?.name ?? "?";
  const owners = describeConflicts(world, approval);
  const released = patchTenant(removeApproval(world, approvalId), approval.slot, { status: "thinking" });

  if (decision === "allow") {
    const painted = applyPaint(released, approval.slot, approval.cells);
    return {
      world: logActivity(
        painted,
        { slot: approval.slot, source: "moderator", text: `Modérateur : autorisé, ${name} repeint ${owners}` },
        now,
      ),
      slot: approval.slot,
      text: `Autorisé par le modérateur. Peint : ${approval.cells.length} pixels.`,
      isError: false,
    };
  }

  return {
    world: logActivity(
      released,
      {
        slot: approval.slot,
        source: "moderator",
        text: `${decision === "deny" ? "Modérateur : refusé" : "Sans réponse du modérateur : refusé"}, ${name} ne repeint pas ${owners}`,
      },
      now,
    ),
    slot: approval.slot,
    text: `${REFUSAL_PREFIX[decision]} : la zone contient ${owners}. Rien n'a été peint. Peins ailleurs ou mets-toi d'accord avec eux dans le chat.`,
    isError: true,
  };
}
