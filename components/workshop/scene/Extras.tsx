import { LIBRARY } from "@/lib/workshop/layout";
import { Decal, IsoBox } from "./iso";

const SHELF = { top: "#c9a274", left: "#a9815a", right: "#93704c" };
const SPINES = ["#e2574c", "#f4c542", "#6f9be8", "#a67bd6", "#4e9f6b"];
const SPINE_WIDTH = 0.2;

interface LibraryModelProps {
  /** L'agent est en train de charger un skill. */
  isActive: boolean;
}

/** La bibliothèque de skills : des savoir-faire rangés là, que l'agent ne charge que quand il en a besoin. */
export function LibraryModel({ isActive }: LibraryModelProps) {
  const front = LIBRARY.y + LIBRARY.depth;
  return (
    <g>
      <IsoBox
        box={{ x: LIBRARY.x, y: LIBRARY.y, z: 0, width: LIBRARY.width, depth: LIBRARY.depth, height: LIBRARY.height }}
        colors={SHELF}
      />
      <Decal plane="left" x={LIBRARY.x} y={front} z={0}>
        <rect x={0.08} y={0.12} width={LIBRARY.width - 0.16} height={LIBRARY.height - 0.24} fill="#7a5c3d" />
        {SPINES.map((color, index) => (
          <rect
            key={color}
            className={isActive && index === 3 ? "scene-shimmer" : undefined}
            x={0.14 + index * (SPINE_WIDTH + 0.04)}
            y={0.18}
            width={SPINE_WIDTH}
            height={0.5 + (index % 2) * 0.12}
            fill={color}
          />
        ))}
      </Decal>
    </g>
  );
}
