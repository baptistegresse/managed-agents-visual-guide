import type { GridPoint } from "@/lib/iso/projection";
import { CRON_CLOCK } from "@/lib/workshop/layout";
import { originAt } from "./Furniture";
import { Decal, IsoBox } from "./iso";

const DESK = { top: "#8f8880", left: "#736d66", right: "#5f5a54" };
const IVORY = { top: "#fbf8f2", left: "#ece6d9", right: "#fbf8f2" };
const CLOCK = { thickness: 0.14, size: 0.42 };
const PEDESTAL = { size: 0.5, height: 0.45 };

interface DeviceProps {
  at: GridPoint;
  isActive: boolean;
  isOn: boolean;
  /** Hauteur de ce sur quoi l'horloge est posée. */
  top: number;
}

/** L'horloge du déploiement planifié : son aiguille tourne quand la ronde est programmée. */
function CronClock({ at, isOn, top }: DeviceProps) {
  const half = CLOCK.size / 2;
  return (
    <g>
      <IsoBox
        box={{ x: at.x - CLOCK.thickness / 2, y: at.y - half, z: top, width: CLOCK.thickness, depth: CLOCK.size, height: CLOCK.size }}
        colors={IVORY}
      />
      <Decal plane="right" x={at.x + CLOCK.thickness / 2} y={at.y - half} z={top}>
        <circle cx={half} cy={half} r={0.16} fill="#ffffff" stroke="#3a3733" strokeWidth={0.03} />
        <line x1={half} y1={half} x2={half} y2={half + 0.07} stroke="#3a3733" strokeWidth={0.035} strokeLinecap="round" />
        <line
          className={isOn ? "scene-spin" : undefined}
          style={{ transformOrigin: `${half}px ${half}px` }}
          x1={half}
          y1={half}
          x2={half + 0.11}
          y2={half}
          stroke="#e2574c"
          strokeWidth={0.03}
          strokeLinecap="round"
        />
      </Decal>
    </g>
  );
}

interface DeploymentClockProps {
  isActive: boolean;
  isOn: boolean;
}

/**
 * Le déploiement planifié : son horloge est posée dans la session, côté Anthropic.
 * À chaque échéance, c'est la plateforme qui ouvre une nouvelle session, sans toi.
 */
export function DeploymentClock({ isActive, isOn }: DeploymentClockProps) {
  const at = CRON_CLOCK;
  const half = PEDESTAL.size / 2;
  return (
    <g>
      <IsoBox
        box={{ x: at.x - half, y: at.y - half, z: 0, width: PEDESTAL.size, depth: PEDESTAL.size, height: PEDESTAL.height }}
        colors={DESK}
      />
      <g className={isActive ? "scene-flash" : undefined} style={originAt(at.x, at.y, PEDESTAL.height)}>
        <CronClock at={at} top={PEDESTAL.height} isActive={isActive} isOn={isOn} />
      </g>
    </g>
  );
}
