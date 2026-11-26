import type { ReactNode } from "react";
import { boxFaces, planeMatrix, project, type Box, type Plane } from "@/lib/iso/projection";

export interface FaceColors {
  top: string;
  left: string;
  right: string;
}

interface IsoBoxProps {
  box: Box;
  colors: FaceColors;
  stroke?: string;
}

/** Un pavé vu en isométrie : ses trois faces visibles, chacune avec sa teinte. */
export function IsoBox({ box, colors, stroke }: IsoBoxProps) {
  const faces = boxFaces(box);
  const outline = stroke ? { stroke, strokeWidth: 0.75, strokeLinejoin: "round" as const } : {};
  return (
    <g>
      <polygon points={faces.left} fill={colors.left} {...outline} />
      <polygon points={faces.right} fill={colors.right} {...outline} />
      <polygon points={faces.top} fill={colors.top} {...outline} />
    </g>
  );
}

interface DecalProps {
  plane: Plane;
  x: number;
  y: number;
  z: number;
  children: ReactNode;
}

/** Plaque un dessin plat, exprimé en cases, sur une face de la scène. */
export function Decal({ plane, x, y, z, children }: DecalProps) {
  return <g transform={planeMatrix(plane, { x, y, z })}>{children}</g>;
}

interface AtProps {
  x: number;
  y: number;
  z?: number;
  children: ReactNode;
}

/** Place un dessin « debout » (non déformé) à un point de la scène. */
export function At({ x, y, z = 0, children }: AtProps) {
  const point = project(x, y, z);
  return <g transform={`translate(${point.x} ${point.y})`}>{children}</g>;
}

/**
 * L'état d'une pièce de la scène : cachée, à l'état de plan (« ghost », elle
 * viendra plus tard), en aperçu (c'est son tour), ou construite.
 */
export type Phase = "hidden" | "ghost" | "preview" | "built";

interface StageProps {
  phase: Phase;
  children: ReactNode;
}

const STAGE_CLASSES: Readonly<Record<Exclude<Phase, "hidden">, string>> = {
  ghost: "scene-ghost",
  preview: "scene-preview",
  built: "scene-land",
};

/** Fait apparaître une pièce de la scène ; changer d'état la fait « atterrir » à nouveau. */
export function Stage({ phase, children }: StageProps) {
  if (phase === "hidden") return null;
  return (
    <g key={phase} className={STAGE_CLASSES[phase]}>
      {children}
    </g>
  );
}
