import { project } from "@/lib/iso/projection";
import type { Networking } from "@/lib/lesson/types";
import { SESSION_ZONE, WALL_HEIGHT, WORKBENCH, type Zone } from "@/lib/workshop/layout";
import { Decal, IsoBox, type FaceColors } from "./iso";

const SESSION_FLOOR: FaceColors = { top: "#f1eadc", left: "#cfc3ad", right: "#bdb098" };
const WALL: FaceColors = { top: "#f8f3e9", left: "#e9e0cf", right: "#dcd2bf" };
const FLOOR_THICKNESS = 0.5;
const WALL_THICKNESS = 0.28;
/** Décalage vertical de l'ombre portée, en pixels de la scène. */
const SHADOW_DROP = 24;
/** La trappe réseau du conteneur : sur le mur du fond, juste au-dessus de l'établi. */
const HATCH = { x: WORKBENCH.x + 0.05, z: 1.15, width: 1.1, height: 0.95 };

function outline(zone: Zone): string {
  return [
    project(zone.x, zone.y),
    project(zone.x + zone.width, zone.y),
    project(zone.x + zone.width, zone.y + zone.depth),
    project(zone.x, zone.y + zone.depth),
  ]
    .map((corner) => `${corner.x},${corner.y}`)
    .join(" ");
}

function floorLines(zone: Zone): string {
  const columns = Array.from({ length: Math.ceil(zone.width) - 1 }, (_, index) => zone.x + index + 1).map((x) => [
    project(x, zone.y),
    project(x, zone.y + zone.depth),
  ]);
  const rows = Array.from({ length: Math.ceil(zone.depth) - 1 }, (_, index) => zone.y + index + 1).map((y) => [
    project(zone.x, y),
    project(zone.x + zone.width, y),
  ]);
  return [...columns, ...rows].map(([from, to]) => `M${from.x} ${from.y}L${to.x} ${to.y}`).join("");
}

interface PlatformProps {
  zone: Zone;
  colors: FaceColors;
  lineColor: string;
}

function Platform({ zone, colors, lineColor }: PlatformProps) {
  return (
    <g>
      {/* Une ombre douce sous la plateforme, pour qu'elle se détache du fond. */}
      <polygon
        points={outline(zone)}
        transform={`translate(0 ${SHADOW_DROP})`}
        fill="#3b2f1e"
        opacity={0.1}
        style={{ filter: "blur(7px)" }}
      />
      <IsoBox
        box={{ x: zone.x, y: zone.y, z: -FLOOR_THICKNESS, width: zone.width, depth: zone.depth, height: FLOOR_THICKNESS }}
        colors={colors}
      />
      <path d={floorLines(zone)} stroke={lineColor} strokeWidth={1} fill="none" />
    </g>
  );
}

interface NetworkHatchProps {
  isOpen: boolean;
}

/** La sortie réseau du conteneur : barrée quand le réseau est fermé, un globe quand il est ouvert. */
function NetworkHatch({ isOpen }: NetworkHatchProps) {
  return (
    <Decal plane="left" x={HATCH.x} y={0} z={HATCH.z}>
      <rect
        width={HATCH.width}
        height={HATCH.height}
        rx={0.1}
        fill={isOpen ? "#bfe3f5" : "#cfc6b4"}
        stroke={isOpen ? "#5aa9d6" : "#a99f8b"}
        strokeWidth={0.06}
      />
      {isOpen ? (
        <g fill="none" stroke="#3f8fc0" strokeWidth={0.05}>
          <circle cx={HATCH.width / 2} cy={HATCH.height / 2} r={0.42} />
          <ellipse cx={HATCH.width / 2} cy={HATCH.height / 2} rx={0.18} ry={0.42} />
          <line x1={HATCH.width / 2 - 0.42} y1={HATCH.height / 2} x2={HATCH.width / 2 + 0.42} y2={HATCH.height / 2} />
        </g>
      ) : (
        <g stroke="#a99f8b" strokeWidth={0.07} strokeLinecap="round">
          <line x1={0.2} y1={0.2} x2={HATCH.width - 0.2} y2={HATCH.height - 0.2} />
          <line x1={0.2} y1={HATCH.height - 0.2} x2={HATCH.width - 0.2} y2={0.2} />
        </g>
      )}
    </Decal>
  );
}

interface SessionRoomProps {
  networking: Networking;
  /** Le conteneur est-il posé ? Sans lui, il n'y a pas de sortie réseau à montrer. */
  hasContainer: boolean;
}

/**
 * La session, chez Anthropic : la pièce où tourne la boucle de l'agent, avec son
 * conteneur (l'établi). La trappe au-dessus de l'établi est la sortie réseau du
 * conteneur, fermée si l'environnement est isolé.
 */
export function SessionRoom({ networking, hasContainer }: SessionRoomProps) {
  const isOpen = networking === "unrestricted";
  const { width, depth } = SESSION_ZONE;
  return (
    <g>
      <Platform zone={SESSION_ZONE} colors={SESSION_FLOOR} lineColor="#e0d7c5" />
      <IsoBox box={{ x: 0, y: -WALL_THICKNESS, z: 0, width, depth: WALL_THICKNESS, height: WALL_HEIGHT }} colors={WALL} />
      <IsoBox
        box={{ x: -WALL_THICKNESS, y: -WALL_THICKNESS, z: 0, width: WALL_THICKNESS, depth: depth + WALL_THICKNESS, height: WALL_HEIGHT }}
        colors={WALL}
      />
      {hasContainer && <NetworkHatch isOpen={isOpen} />}
    </g>
  );
}
