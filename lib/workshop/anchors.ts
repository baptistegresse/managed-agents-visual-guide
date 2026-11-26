import { project, type GridPoint } from "@/lib/iso/projection";
import type { Hop, Place } from "./effects";
import { placePoint, SCENE_VIEW } from "./layout";

/** De quel côté se trouve un endroit : dans la pièce de la session, chez toi, ou dans le monde extérieur. */
export type Side = "room" | "app" | "world";

/** Un rectangle de la scène, en pixels de son repère. */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface HopAnchors {
  readonly from: ScreenPoint;
  readonly to: ScreenPoint;
}

/** Retrait du point par où un appel sort, en part de la largeur de ce qui est à l'écran. */
const DOOR_INSET_SHARE = 0.035;
/** Hauteur de ce point, en part de la hauteur de ce qui est à l'écran. */
const DOOR_SHARE = 0.58;
/** Le couloir sous la pièce, pour ce qui se passe entre ton application et le monde extérieur. */
const LANE_INSET_SHARE = 0.06;

const ROOM_PLACES: ReadonlySet<Place> = new Set(["agent", "vault", "cron"]);
const APP_PLACES: ReadonlySet<Place> = new Set(["app", "webhook", "orders"]);

export function sideOf(place: Place): Side {
  if (ROOM_PLACES.has(place)) return "room";
  return APP_PLACES.has(place) ? "app" : "world";
}

/**
 * D'où part et où arrive un appel, en pixels de la scène. Seule la pièce de la
 * session est dessinée : ce qui va chez toi sort par le bord gauche de ce qui
 * est à l'écran, ce qui va vers le monde extérieur par le bord droit. Ce qui
 * relie les deux côtés passe en bas, sous l'agent, et ce qui reste d'un seul
 * côté n'a aucun trajet à montrer.
 */
export function hopAnchors(hop: Pick<Hop, "from" | "to">, agent: GridPoint, frame: Frame = SCENE_VIEW): HopAnchors | null {
  const sides = { from: sideOf(hop.from), to: sideOf(hop.to) };
  if (sides.from !== "room" && sides.from === sides.to) return null;

  const isOutside = sides.from !== "room" && sides.to !== "room";
  const inset = frame.width * DOOR_INSET_SHARE;
  const y = isOutside ? frame.y + frame.height * (1 - LANE_INSET_SHARE) : frame.y + frame.height * DOOR_SHARE;
  const anchor = (place: Place, side: Side): ScreenPoint => {
    if (side === "app") return { x: frame.x + inset, y };
    if (side === "world") return { x: frame.x + frame.width - inset, y };
    const point = placePoint(place, agent);
    return project(point.x, point.y, point.z);
  };
  return { from: anchor(hop.from, sides.from), to: anchor(hop.to, sides.to) };
}
