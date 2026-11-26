import { boxFaces } from "@/lib/iso/projection";
import { COMPACT_AT_SHARE, type BlockKind, type ContextWindow } from "@/lib/workshop/context";
import { CONTEXT_STACK } from "@/lib/workshop/layout";
import { originAt } from "./Furniture";
import { IsoBox, type FaceColors } from "./iso";

/** Hauteur de la pile quand la fenêtre est pleine, en cases. */
export const STACK_FULL_HEIGHT = 2.2;
const MIN_SLAB_HEIGHT = 0.035;
const BASE_HEIGHT = 0.1;

/** Une teinte par nature de bloc ; les mêmes servent dans le panneau « Fenêtre de contexte ». */
export const BLOCK_COLORS: Readonly<Record<BlockKind, FaceColors>> = {
  system: { top: "#aaa39a", left: "#8f8880", right: "#7b756e" },
  tools: { top: "#f0cd6a", left: "#e8b93b", right: "#cfa02a" },
  user: { top: "#86cf9d", left: "#5fb878", right: "#4ea066" },
  assistant: { top: "#eb9a7f", left: "#d97757", right: "#bf6245" },
  tool_use: { top: "#c0a0e4", left: "#a67bd6", right: "#9068c0" },
  tool_result: { top: "#7fc4e8", left: "#4f9fd0", right: "#3f8fc0" },
  summary: { top: "#5a5550", left: "#403c38", right: "#2f2c29" },
};

const BASE: FaceColors = { top: "#e9e0cf", left: "#cfc3ad", right: "#bdb098" };

interface ContextStackProps {
  context: ContextWindow;
}

/**
 * La fenêtre de contexte, dessinée comme une pile : un étage par bloc que le
 * modèle relit, d'autant plus épais qu'il pèse de tokens. Le cadre en pointillés
 * marque la fenêtre pleine ; le trait rouge, le seuil où la plateforme compacte.
 */
export function ContextStack({ context }: ContextStackProps) {
  const { x, y, size } = CONTEXT_STACK;
  const unitPerToken = STACK_FULL_HEIGHT / context.limit;
  const slabs = context.blocks.reduce<{ z: number; items: { id: number; kind: BlockKind; z: number; height: number }[] }>(
    (stack, block) => {
      const height = Math.max(MIN_SLAB_HEIGHT, block.tokens * unitPerToken);
      return { z: stack.z + height, items: [...stack.items, { id: block.id, kind: block.kind, z: stack.z, height }] };
    },
    { z: BASE_HEIGHT, items: [] },
  );
  const glow = boxFaces({ x, y, z: BASE_HEIGHT, width: size, depth: size, height: slabs.z - BASE_HEIGHT });
  const frame = boxFaces({ x, y, z: BASE_HEIGHT, width: size, depth: size, height: STACK_FULL_HEIGHT });
  const threshold = boxFaces({
    x,
    y,
    z: BASE_HEIGHT + STACK_FULL_HEIGHT * COMPACT_AT_SHARE,
    width: size,
    depth: size,
    height: 0,
  });
  return (
    <g>
      <IsoBox box={{ x: x - 0.08, y: y - 0.08, z: 0, width: size + 0.16, depth: size + 0.16, height: BASE_HEIGHT }} colors={BASE} />
      {slabs.items.map((slab) => (
        <g key={slab.id} className="scene-pop" style={originAt(x + size / 2, y + size / 2, slab.z)}>
          <IsoBox box={{ x, y, z: slab.z, width: size, depth: size, height: slab.height }} colors={BLOCK_COLORS[slab.kind]} />
        </g>
      ))}
      {/* Une requête au modèle relit toute la pile : un éclair la parcourt, sans la reconstruire. */}
      {context.requestCount > 0 && slabs.z > BASE_HEIGHT && (
        <g key={context.requestCount} className="scene-read" fill="#ffffff">
          <polygon points={glow.left} />
          <polygon points={glow.right} />
          <polygon points={glow.top} />
        </g>
      )}
      <g fill="none" stroke="#a99f8b" strokeWidth={0.9} strokeDasharray="3 3">
        <polygon points={frame.left} />
        <polygon points={frame.right} />
        <polygon points={frame.top} />
      </g>
      <polygon points={threshold.top} fill="none" stroke="#d9534f" strokeWidth={1} strokeDasharray="2 3" />
    </g>
  );
}
