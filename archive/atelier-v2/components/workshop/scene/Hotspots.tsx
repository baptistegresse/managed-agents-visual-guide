import type { KeyboardEvent, MouseEvent } from "react";
import { boxFaces, project, type GridPoint } from "@/lib/iso/projection";
import type { GridBox } from "@/lib/workshop/camera";
import { partById, type PartId } from "@/lib/workshop/parts";

interface HotspotsProps {
  /** Les parties sur lesquelles on peut cliquer en ce moment. */
  parts: readonly PartId[];
  /** Celle sur laquelle la caméra est posée : un clic dessus dézoome. */
  focus: PartId;
  /** Celle que l'introduction demande de cliquer : elle est signalée. */
  target: PartId | null;
  /** Où se tient l'agent : sa zone de clic le suit, serrée autour de lui. */
  agentAt: GridPoint;
  /** L'agrandissement de la caméra : le repère « clique ici » garde sa taille quel que soit le zoom. */
  zoom: number;
  onPick: (part: PartId) => void;
}

const MARKER_LIFT = 0.25;
const AGENT_REACH = 0.62;
const AGENT_HEIGHT = 1.5;

/** Le volume à cliquer pour une partie : son cadre, sauf pour l'agent, qu'on vise lui-même. */
function hitBox(id: PartId, agentAt: GridPoint): GridBox | null {
  if (id !== "agent") return partById(id).box;
  return {
    x0: agentAt.x - AGENT_REACH,
    y0: agentAt.y - AGENT_REACH,
    x1: agentAt.x + AGENT_REACH,
    y1: agentAt.y + AGENT_REACH,
    height: AGENT_HEIGHT,
  };
}

function footprint(box: GridBox): number {
  return (box.x1 - box.x0) * (box.y1 - box.y0);
}

interface HotspotProps {
  id: PartId;
  box: GridBox;
  isFocused: boolean;
  isTarget: boolean;
  zoom: number;
  onPick: (part: PartId) => void;
}

/** Le volume d'une partie, invisible tant qu'on ne le survole pas : c'est lui qui reçoit le clic. */
function Hotspot({ id, box, isFocused, isTarget, zoom, onPick }: HotspotProps) {
  const faces = boxFaces({ x: box.x0, y: box.y0, z: 0, width: box.x1 - box.x0, depth: box.y1 - box.y0, height: box.height });
  const top = project((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, box.height + MARKER_LIFT);
  const { label } = partById(id);
  const pick = (event: MouseEvent): void => {
    event.stopPropagation();
    onPick(id);
  };
  const pickWithKeyboard = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onPick(id);
  };
  return (
    <g
      className={`scene-hotspot${isTarget ? " scene-hotspot-target" : ""}${isFocused ? " scene-hotspot-focused" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={isFocused ? `Dézoomer de : ${label}` : `Regarder de près : ${label}`}
      onClick={pick}
      onKeyDown={pickWithKeyboard}
    >
      <title>{isFocused ? "Cliquer pour dézoomer" : label}</title>
      <polygon points={faces.left} />
      <polygon points={faces.right} />
      <polygon points={faces.top} />
      {isTarget && (
        <g transform={`translate(${top.x} ${top.y}) scale(${1 / zoom})`} pointerEvents="none">
          <circle className="scene-ping" r={13} fill="none" stroke="#d97757" strokeWidth={2} />
          <circle r={6} fill="#d97757" stroke="#ffffff" strokeWidth={2} />
          <g className="scene-alert">
            <rect x={-33} y={-36} width={66} height={20} rx={10} fill="#d97757" />
            <text y={-22} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffffff">
              clique ici
            </text>
          </g>
        </g>
      )}
    </g>
  );
}

/**
 * Les zones cliquables de la scène : on clique sur une partie pour aller la
 * regarder de près. Les plus petites sont dessinées en dernier, donc au-dessus
 * des grandes qui les contiennent.
 */
export function Hotspots({ parts, focus, target, agentAt, zoom, onPick }: HotspotsProps) {
  const shapes = parts
    .flatMap((id) => {
      const box = hitBox(id, agentAt);
      return box ? [{ id, box }] : [];
    })
    .sort((left, right) => footprint(right.box) - footprint(left.box));
  return (
    <g>
      {shapes.map(({ id, box }) => (
        <Hotspot key={id} id={id} box={box} isFocused={id === focus} isTarget={id === target} zoom={zoom} onPick={onPick} />
      ))}
    </g>
  );
}
