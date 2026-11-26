import type { CSSProperties } from "react";
import type { GridPoint } from "@/lib/iso/projection";
import { hopAnchors } from "@/lib/workshop/anchors";
import type { Frame } from "@/lib/workshop/anchors";
import type { Hop } from "@/lib/workshop/effects";

export const HOP_COLORS: Readonly<Record<Hop["tone"], string>> = {
  entry: "#d9a521",
  call: "#d97757",
  result: "#3f9b63",
  error: "#d9534f",
  effect: "#12a594",
};

interface HopLineProps {
  hop: Hop;
  /** Où se tient l'agent : c'est une des extrémités possibles du trajet. */
  agent: GridPoint;
  /** Ce que la caméra montre : l'appel sort par les bords de ce cadre. */
  frame: Frame;
}

/**
 * Un appel en train de voyager : un trait pointillé entre le départ et l'arrivée,
 * et un point qui fait le trajet. Ce qui part chez toi sort par le bord gauche de
 * la pièce, ce qui part vers le monde extérieur par le bord droit.
 */
export function HopLine({ hop, agent, frame }: HopLineProps) {
  const anchors = hopAnchors(hop, agent, frame);
  if (!anchors) return null;
  const { from, to } = anchors;
  const color = HOP_COLORS[hop.tone];
  const flight = {
    "--from-x": `${from.x}px`,
    "--from-y": `${from.y}px`,
    "--to-x": `${to.x}px`,
    "--to-y": `${to.y}px`,
  } as CSSProperties;
  return (
    <g>
      <line
        className="scene-dash"
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={color}
        strokeWidth={2.2}
        strokeDasharray="5 5"
        strokeLinecap="round"
      />
      <circle cx={from.x} cy={from.y} r={3} fill={color} opacity={0.5} />
      <circle cx={to.x} cy={to.y} r={4.5} fill="none" stroke={color} strokeWidth={1.6} />
      <g className="scene-fly" style={flight}>
        <circle r={5.5} fill={color} stroke="#ffffff" strokeWidth={1.4} />
      </g>
    </g>
  );
}
