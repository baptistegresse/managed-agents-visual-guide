import { project } from "@/lib/iso/projection";
import { NIGHTSTAND, WORKBENCH } from "@/lib/workshop/layout";
import { Decal, IsoBox } from "./iso";

const DESK = { top: "#b9a184", left: "#97805f", right: "#836d50" };
const CASE = { top: "#4a4642", left: "#33302d", right: "#272523" };
const PAPER = { top: "#ffffff", left: "#e6e1d6", right: "#d6d0c3" };
const WOOD = { top: "#dcb88e", left: "#bb8f63", right: "#a57c54" };
const BOOK = { top: "#a688d8", left: "#8468bb", right: "#7059a4" };
const MONITOR = { offsetX: 0.42, offsetY: 0.24, width: 0.68, depth: 0.12, height: 0.55 };
const MAX_SHEETS = 4;

interface WorkbenchModelProps {
  /** Un outil du bac à sable tourne : l'écran s'allume. */
  isActive: boolean;
  fileCount: number;
  /** Un fichier a été monté dans le conteneur au démarrage de la session. */
  hasMountedFile: boolean;
}

/** L'établi du bac à sable : là où tournent bash et les outils de fichiers, dans le conteneur. */
export function WorkbenchModel({ isActive, fileCount, hasMountedFile }: WorkbenchModelProps) {
  const screenY = WORKBENCH.y + MONITOR.offsetY + MONITOR.depth;
  return (
    <g>
      <IsoBox
        box={{ x: WORKBENCH.x, y: WORKBENCH.y, z: 0, width: WORKBENCH.width, depth: WORKBENCH.depth, height: WORKBENCH.height }}
        colors={DESK}
      />
      <IsoBox
        box={{
          x: WORKBENCH.x + MONITOR.offsetX,
          y: WORKBENCH.y + MONITOR.offsetY,
          z: WORKBENCH.height,
          width: MONITOR.width,
          depth: MONITOR.depth,
          height: MONITOR.height,
        }}
        colors={CASE}
      />
      <Decal plane="left" x={WORKBENCH.x + MONITOR.offsetX} y={screenY} z={WORKBENCH.height}>
        <rect x={0.05} y={0.06} width={MONITOR.width - 0.1} height={MONITOR.height - 0.12} rx={0.03} fill={isActive ? "#1f3a2a" : "#1d1f1e"} />
        {isActive && (
          <g className="scene-shimmer" stroke="#7be0a1" strokeWidth={0.035} strokeLinecap="round">
            <line x1={0.12} y1={0.4} x2={0.44} y2={0.4} />
            <line x1={0.12} y1={0.3} x2={0.56} y2={0.3} />
            <line x1={0.12} y1={0.2} x2={0.34} y2={0.2} />
          </g>
        )}
      </Decal>
      {hasMountedFile && (
        <IsoBox
          box={{ x: WORKBENCH.x + 0.06, y: WORKBENCH.y + 0.08, z: WORKBENCH.height, width: 0.28, depth: 0.34, height: 0.035 }}
          colors={{ top: "#9cc3ec", left: "#7ba6d3", right: "#6893c1" }}
        />
      )}
      {Array.from({ length: Math.min(fileCount, MAX_SHEETS) }, (_, index) => (
        <IsoBox
          key={index}
          box={{ x: WORKBENCH.x + 0.06, y: WORKBENCH.y + 0.48, z: WORKBENCH.height + index * 0.035, width: 0.28, depth: 0.34, height: 0.03 }}
          colors={PAPER}
        />
      ))}
    </g>
  );
}

interface NightstandModelProps {
  /** L'agent lit ou écrit son carnet. */
  isActive: boolean;
}

/** La table de chevet et son carnet : la mémoire, qui survit d'une session à l'autre. */
export function NightstandModel({ isActive }: NightstandModelProps) {
  const top = project(NIGHTSTAND.x + NIGHTSTAND.size / 2, NIGHTSTAND.y + NIGHTSTAND.size / 2, NIGHTSTAND.height);
  return (
    <g>
      <IsoBox
        box={{ x: NIGHTSTAND.x, y: NIGHTSTAND.y, z: 0, width: NIGHTSTAND.size, depth: NIGHTSTAND.size, height: NIGHTSTAND.height }}
        colors={WOOD}
      />
      <g className={isActive ? "scene-flash" : undefined} style={{ transformOrigin: `${top.x}px ${top.y}px` }}>
        <IsoBox
          box={{ x: NIGHTSTAND.x + 0.1, y: NIGHTSTAND.y + 0.14, z: NIGHTSTAND.height, width: 0.4, depth: 0.3, height: 0.09 }}
          colors={BOOK}
        />
      </g>
    </g>
  );
}
