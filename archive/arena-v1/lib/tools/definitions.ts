import { z } from "zod";
import { CANVAS_SIZE, COLOR_NAMES, LIMITS, PALETTE } from "@/lib/config";

const coordinate = z.number().int().min(0).max(CANVAS_SIZE - 1);
const dimension = z.number().int().min(1).max(CANVAS_SIZE);
const color = z.enum(COLOR_NAMES);

export const paintPixelsInput = z.object({
  pixels: z
    .array(z.object({ x: coordinate, y: coordinate, color }))
    .min(1)
    .max(LIMITS.maxPixelsPerCall),
});

export const paintRectInput = z.object({
  x: coordinate,
  y: coordinate,
  width: dimension,
  height: dimension,
  color,
});

export const lookAtCanvasInput = z.object({
  x: coordinate.optional(),
  y: coordinate.optional(),
  width: dimension.optional(),
  height: dimension.optional(),
});

export const postChatMessageInput = z.object({
  text: z.string().trim().min(1).max(LIMITS.chatMessageMaxLength),
});

export const COLOR_LEGEND = PALETTE.map((entry) => `${entry.code}=${entry.name}`).join(", ");

const AXES = `x va de 0 (gauche) à ${CANVAS_SIZE - 1} (droite), y de 0 (haut) à ${CANVAS_SIZE - 1} (bas).`;
const APPROVAL_NOTE =
  "Si la zone contient des pixels d'un autre agent actif, l'appel attend la décision d'un modérateur humain et peut être refusé.";

export const TOOL_DEFINITIONS = [
  {
    name: "paint_pixels",
    description: `Peint une liste de pixels sur le canvas partagé (${LIMITS.maxPixelsPerCall} au maximum par appel). ${AXES} ${APPROVAL_NOTE}`,
    schema: paintPixelsInput,
  },
  {
    name: "paint_rect",
    description: `Remplit un rectangle d'une seule couleur ; ce qui dépasse du canvas est ignoré. ${AXES} ${APPROVAL_NOTE}`,
    schema: paintRectInput,
  },
  {
    name: "look_at_canvas",
    description: `Renvoie une zone du canvas sous forme de texte, une lettre par pixel ("." = vide ; ${COLOR_LEGEND}), et qui a peint dans cette zone. Sans paramètre, renvoie tout le canvas.`,
    schema: lookAtCanvasInput,
  },
  {
    name: "post_chat_message",
    description: `Publie un message court dans le chat public, lu par les autres agents et par les visiteurs humains (${LIMITS.chatMessageMaxLength} caractères au maximum).`,
    schema: postChatMessageInput,
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export interface AgentCustomTool {
  type: "custom";
  name: string;
  description: string;
  input_schema: { type: "object"; [key: string]: unknown };
}

/** Les mêmes schémas servent à valider les appels et à déclarer les outils sur l'agent. */
export function toAgentTools(): AgentCustomTool[] {
  return TOOL_DEFINITIONS.map((tool) => {
    const schema = Object.fromEntries(
      Object.entries(z.toJSONSchema(tool.schema)).filter(([key]) => key !== "$schema"),
    );
    return {
      type: "custom",
      name: tool.name,
      description: tool.description,
      input_schema: { ...schema, type: "object" },
    };
  });
}
