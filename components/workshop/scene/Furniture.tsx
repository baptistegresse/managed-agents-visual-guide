import { project } from "@/lib/iso/projection";
import type { KeyId } from "@/lib/workshop/catalog";
import { BED, BED_TOP, VAULT } from "@/lib/workshop/layout";
import { At, Decal, IsoBox } from "./iso";

const STEEL = { top: "#5a5550", left: "#403c38", right: "#2f2c29" };
const GOLD = "#e8b93b";
const BED_FRAME = { top: "#d2a877", left: "#b3895c", right: "#9c754c" };
const MATTRESS = { top: "#fbf7ee", left: "#e9e2d2", right: "#d9d1bf" };
const PILLOW = { top: "#ffffff", left: "#ebe7dd", right: "#dcd7cb" };
const BLANKET = { top: "#8fb5d6", left: "#7099bd", right: "#5f87aa" };
const BLANKET_START = 0.8;
/** Marge entre le bord du coffre et sa porte, ses clés. */
const VAULT_INSET = 0.14;

interface VaultModelProps {
  keys: readonly KeyId[];
  isShaking: boolean;
}

/** Le vault : un coffre. Chaque clé confiée y apparaît, posée sur le dessus. */
export function VaultModel({ keys, isShaking }: VaultModelProps) {
  const top = VAULT.height;
  const front = VAULT.x + VAULT.size;
  const doorWidth = VAULT.size - 2 * VAULT_INSET;
  const doorHeight = VAULT.height - 2 * VAULT_INSET;
  return (
    <g className={isShaking ? "scene-shake" : undefined}>
      <IsoBox
        box={{ x: VAULT.x, y: VAULT.y, z: 0, width: VAULT.size, depth: VAULT.size, height: VAULT.height }}
        colors={STEEL}
      />
      <Decal plane="right" x={front} y={VAULT.y + VAULT_INSET} z={VAULT_INSET}>
        <rect width={doorWidth} height={doorHeight} rx={0.06} fill="none" stroke="#6b655f" strokeWidth={0.04} />
        <circle cx={doorWidth / 2} cy={doorHeight / 2} r={VAULT.size * 0.18} fill="#d97757" />
        <circle cx={doorWidth / 2} cy={doorHeight / 2} r={VAULT.size * 0.06} fill="#2f2c29" />
      </Decal>
      {keys.map((key, index) => (
        <At
          key={key}
          x={VAULT.x + VAULT_INSET + ((index + 0.5) * (VAULT.size - 2 * VAULT_INSET)) / keys.length}
          y={VAULT.y + VAULT.size / 2}
          z={top}
        >
          <g className="scene-pop">
            <KeyGlyph />
          </g>
        </At>
      ))}
    </g>
  );
}

/** Le lit, sans sa couverture : sommier, tête de lit, matelas et oreiller. */
export function BedModel() {
  return (
    <g>
      <IsoBox
        box={{ x: BED.x - 0.12, y: BED.y, z: 0, width: 0.12, depth: BED.width, height: 1 }}
        colors={BED_FRAME}
      />
      <IsoBox
        box={{ x: BED.x, y: BED.y, z: 0, width: BED.length, depth: BED.width, height: BED.frameHeight }}
        colors={BED_FRAME}
      />
      <IsoBox
        box={{
          x: BED.x,
          y: BED.y + 0.06,
          z: BED.frameHeight,
          width: BED.length - 0.06,
          depth: BED.width - 0.12,
          height: BED.mattressHeight,
        }}
        colors={MATTRESS}
      />
      <IsoBox
        box={{ x: BED.x + 0.08, y: BED.y + 0.18, z: BED_TOP, width: 0.4, depth: BED.width - 0.36, height: 0.12 }}
        colors={PILLOW}
      />
    </g>
  );
}

/** La couverture : dessinée par-dessus l'agent quand il est couché, pour qu'il soit bordé. */
export function BedBlanket() {
  return (
    <IsoBox
      box={{
        x: BED.x + BLANKET_START,
        y: BED.y + 0.03,
        z: BED_TOP,
        width: BED.length - BLANKET_START,
        depth: BED.width - 0.06,
        height: 0.14,
      }}
      colors={BLANKET}
    />
  );
}

/** Une petite clé dorée, dessinée debout. */
export function KeyGlyph() {
  return (
    <g fill="none" stroke={GOLD} strokeWidth={2.2} strokeLinecap="round">
      <circle cx={0} cy={-11.5} r={3.2} />
      <path d="M0 -8V-1M0 -4H3M0 -1.5H2.4" />
    </g>
  );
}

/** Point d'ancrage CSS d'un objet posé en (x, y, z), pour qu'il grandisse depuis sa base. */
export function originAt(x: number, y: number, z: number): { transformOrigin: string } {
  const point = project(x, y, z);
  return { transformOrigin: `${point.x}px ${point.y}px` };
}
