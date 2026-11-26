import { project } from "@/lib/iso/projection";
import { AGENT_HOME, BED_TOP } from "@/lib/workshop/layout";
import type { Actor } from "@/lib/workshop/run";
import { At, Decal, IsoBox } from "./iso";
import { Spark } from "./voxels";

interface AgentModelProps {
  actor: Actor;
  /** L'agent existe mais n'a rien à faire : il dort en attendant une consigne. */
  isAsleep: boolean;
}

const CORAL = { top: "#eb9a7f", left: "#d97757", right: "#bf6245" };
const CORAL_DARK = { top: "#bf6245", left: "#a8553b", right: "#934a33" };
/** Une session terminée : l'agent est éteint, tout gris. */
const ASH = { top: "#bdb8b0", left: "#a39e96", right: "#8b8780" };
const ASH_DARK = { top: "#8b8780", left: "#77736d", right: "#66625d" };
const BODY = { x: -0.4, y: -0.4, z: 0.18, width: 0.8, depth: 0.8, height: 0.82 };
const HEAD_TOP = BODY.z + BODY.height;
const EYES_X = [0.18, 0.49] as const;
const SNORE_DELAY_SECONDS = 0.9;

/**
 * L'agent : un petit cube corail avec une étincelle. Il est dessiné autour de
 * l'origine, puis déplacé en CSS pour que ses trajets soient animés.
 */
export function AgentModel({ actor, isAsleep }: AgentModelProps) {
  /** À sa place, l'agent est dans son lit, posé sur le matelas, endormi ou tout juste réveillé. */
  const isInBed = actor.position.x === AGENT_HOME.x && actor.position.y === AGENT_HOME.y;
  const place = project(actor.position.x, actor.position.y, isInBed ? BED_TOP : 0);
  const isBusy = actor.mood === "thinking" || actor.mood === "working";
  const isOff = actor.mood === "off";
  const eyesClosed = isAsleep || isOff;
  return (
    <g
      style={{
        transform: `translate(${place.x}px, ${place.y}px)`,
        transition: `transform ${actor.moveMs}ms linear`,
      }}
    >
      {!isInBed && (
        <Decal plane="top" x={0} y={0} z={0.01}>
          <ellipse rx={0.58} ry={0.58} fill="#2b2723" opacity={0.14} />
        </Decal>
      )}
      <g
        className={
          actor.mood === "walking"
            ? "scene-bob"
            : actor.mood === "stunned"
              ? "scene-shake"
              : isAsleep
                ? "scene-breathe"
                : undefined
        }
      >
        <IsoBox box={{ x: -0.3, y: -0.3, z: 0, width: 0.6, depth: 0.6, height: 0.18 }} colors={isOff ? ASH_DARK : CORAL_DARK} />
        <IsoBox box={BODY} colors={isOff ? ASH : CORAL} />
        {/* Le visage, sur la face tournée vers nous à gauche. */}
        <Decal plane="left" x={BODY.x} y={BODY.y + BODY.depth} z={BODY.z}>
          {EYES_X.map((x) => (
            <rect
              key={x}
              x={x}
              y={eyesClosed ? 0.46 : 0.4}
              width={0.13}
              height={eyesClosed ? 0.045 : 0.2}
              rx={eyesClosed ? 0.02 : 0.05}
              fill="#2b2723"
            />
          ))}
        </Decal>
        {/* L'emblème, sur l'autre face. */}
        <Decal plane="right" x={BODY.x + BODY.width} y={BODY.y} z={BODY.z}>
          <g transform="translate(0.4 0.41)">
            <Spark radius={0.23} color="#fbf8f2" />
          </g>
        </Decal>
        <At x={0} y={0} z={HEAD_TOP}>
          <line x1={0} y1={0} x2={0} y2={-10} stroke="#934a33" strokeWidth={1.8} />
        </At>
        <At x={0} y={0} z={HEAD_TOP + 0.6}>
          <g className={isBusy ? "scene-spin" : undefined}>
            <Spark radius={8} color="#d97757" />
          </g>
        </At>
        {isAsleep && (
          <At x={0} y={0} z={HEAD_TOP + 0.35}>
            {[0, 1, 2].map((index) => (
              <text
                key={index}
                className="scene-zzz"
                style={{ animationDelay: `${index * SNORE_DELAY_SECONDS}s` }}
                x={13}
                y={-2}
                fontSize={12}
                fontWeight={800}
                fill="#b0563a"
              >
                z
              </text>
            ))}
          </At>
        )}
        {actor.mood === "stunned" && (
          <At x={0} y={0} z={HEAD_TOP + 0.5}>
            <path className="scene-alert" d="M14 -10L8 0H13L9 9L19 -2H13Z" fill="#e8b93b" stroke="#8a6a12" strokeWidth={0.8} />
          </At>
        )}
        {actor.mood === "waiting" && (
          <At x={0} y={0} z={HEAD_TOP + 0.5}>
            <text className="scene-alert" x={11} y={0} fontSize={15} fontWeight={800} fill="#b0563a">
              …
            </text>
          </At>
        )}
      </g>
    </g>
  );
}
