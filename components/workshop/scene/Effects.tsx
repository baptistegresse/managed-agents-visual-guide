import type { CSSProperties } from "react";
import { hopAnchors } from "@/lib/workshop/anchors";
import type { Frame } from "@/lib/workshop/anchors";
import { AGENT_HOME } from "@/lib/workshop/layout";
import type { ActiveKey } from "@/lib/workshop/run";
import { KeyGlyph } from "./Furniture";

/** La clé vole un peu au-dessus du trait de l'appel qu'elle accompagne. */
const KEY_LIFT = 12;

interface KeyFlightProps {
  activeKey: ActiveKey;
  /** Ce que la caméra montre : la clé part vers son bord droit. */
  frame: Frame;
}

/**
 * L'identifiant sort du vault et part avec l'appel vers le service tiers : ni
 * l'agent ni ton application ne le voient. S'il manque, une croix rouge au vault.
 */
export function KeyFlight({ activeKey, frame }: KeyFlightProps) {
  const anchors = hopAnchors({ from: "vault", to: `service:${activeKey.key}` }, AGENT_HOME, frame);
  if (!anchors) return null;
  const { from, to } = anchors;
  if (activeKey.isDenied) {
    return (
      <g transform={`translate(${from.x} ${from.y})`} stroke="#d9534f" strokeWidth={3} strokeLinecap="round">
        <line x1={-7} y1={-7} x2={7} y2={7} />
        <line x1={-7} y1={7} x2={7} y2={-7} />
      </g>
    );
  }
  const flight = {
    "--from-x": `${from.x}px`,
    "--from-y": `${from.y - KEY_LIFT}px`,
    "--to-x": `${to.x}px`,
    "--to-y": `${to.y - KEY_LIFT}px`,
  } as CSSProperties;
  return (
    <g className="scene-fly" style={flight}>
      <KeyGlyph />
    </g>
  );
}
