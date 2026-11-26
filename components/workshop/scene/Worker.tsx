import { project, type GridPoint } from "@/lib/iso/projection";
import { At, Decal, IsoBox, type FaceColors } from "./iso";
import { Spark } from "./voxels";

const PEACH: FaceColors = { top: "#fbd5c4", left: "#f4b89f", right: "#e39d83" };
interface ThreadCopyProps {
  position: GridPoint;
}

/** Une copie de l'agent : elle reste dans la session, avec son propre fil et son propre contexte. */
export function ThreadCopy({ position }: ThreadCopyProps) {
  const place = project(position.x, position.y);
  return (
    <g className="scene-pop" style={{ transformOrigin: `${place.x}px ${place.y}px` }}>
      <g transform={`translate(${place.x} ${place.y})`}>
        <Decal plane="top" x={0} y={0} z={0.01}>
          <ellipse rx={0.4} ry={0.4} fill="#2b2723" opacity={0.12} />
        </Decal>
        <IsoBox box={{ x: -0.26, y: -0.26, z: 0.08, width: 0.52, depth: 0.52, height: 0.52 }} colors={PEACH} />
        <Decal plane="left" x={-0.26} y={0.26} z={0.08}>
          <rect x={0.12} y={0.26} width={0.09} height={0.13} rx={0.03} fill="#2b2723" />
          <rect x={0.31} y={0.26} width={0.09} height={0.13} rx={0.03} fill="#2b2723" />
        </Decal>
        <At x={0} y={0} z={0.95}>
          <g className="scene-spin">
            <Spark radius={5} color="#e39d83" />
          </g>
        </At>
      </g>
    </g>
  );
}
