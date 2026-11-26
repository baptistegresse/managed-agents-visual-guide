import type { GridPoint } from "@/lib/iso/projection";
import { KEY_CATALOG, rackIndex, type KeyId, type ToolId } from "./catalog";
import type { EntryPoint, Place } from "./effects";

export interface Zone {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
}

/**
 * Trois plateformes séparées, parce que rien de tout cela ne tourne au même endroit :
 * la session (chez Anthropic), ton application, et le monde extérieur où vit la boîte de support.
 */
export const SESSION_ZONE: Zone = { x: 0, y: 0, width: 5.4, depth: 5.4 };
export const APP_ZONE: Zone = { x: 0, y: 6.6, width: 5.4, depth: 5.4 };
export const WORLD_ZONE: Zone = { x: 6.4, y: 2.4, width: 7.1, depth: 9.6 };
/** La passerelle entre ton application et la boîte de support : ton code est le seul à l'emprunter. */
export const BRIDGE: Zone = { x: 5.4, y: 9.4, width: 1, depth: 1 };
export const BRIDGE_MIDDLE: GridPoint = { x: 5.9, y: 9.9 };
export const WALL_HEIGHT = 2.4;

/**
 * Le cadre de la scène, en pixels de son repère. Elle ne montre que la pièce de la
 * session : ton application et le monde extérieur sont des panneaux, de part et d'autre.
 */
export const SCENE_VIEW = { x: -196, y: -118, width: 392, height: 312 } as const;

/** Le coffre, calé dans l'angle du fond de la session, contre les deux murs. */
export const VAULT = { x: 0.3, y: 0.3, size: 0.95, height: 1 } as const;
/** L'étagère des outils custom : elle est chez toi, c'est ton code qui les exécute. */
export const RACK = { x: 1.5, y: 6.9, slotWidth: 0.74, depth: 0.8, height: 0.7 } as const;
export const DESK_ORIGIN: GridPoint = { x: 7.4, y: 5.8 };
export const DESK_HEIGHT = 0.14;
/** Largeur des deux marges de la planche, en haut et sur le côté. */
export const DESK_HEADER = 0.85;
/** Le lit de l'agent, tête contre le mur de gauche : il y dort quand il n'a rien à faire. */
export const BED = { x: 0.35, y: 2.6, length: 1.9, width: 1.3, frameHeight: 0.22, mattressHeight: 0.18 } as const;
export const BED_TOP = BED.frameHeight + BED.mattressHeight;
/** Sa place dans le lit, côté oreiller. */
export const AGENT_HOME: GridPoint = { x: 0.95, y: 3.25 };
/** Là où il se tient pour réfléchir, à côté de sa fenêtre de contexte. Il ne quitte jamais la session. */
export const AGENT_DESK: GridPoint = { x: 3, y: 3.7 };
/** La pile de la fenêtre de contexte : un étage par bloc que le modèle relit. */
export const CONTEXT_STACK = { x: 3.95, y: 3, size: 0.85 } as const;
/** Où attendent les copies de l'agent quand il délègue : chacune a son propre fil. */
export const THREAD_SPOTS: readonly GridPoint[] = [
  { x: 2, y: 4.55 },
  { x: 3.05, y: 4.75 },
];

/** La console des points d'entrée de ton application : l'appel API et le webhook. */
export const CONSOLE = { x: 0.3, y: 7, width: 0.7, length: 1.7, height: 0.55 } as const;
/** L'horloge du déploiement planifié : elle est côté Anthropic, pas chez toi. */
export const CRON_CLOCK: GridPoint = { x: 4.7, y: 4.75 };
const ENTRY_SPACING = 0.8;

/** Où se trouve l'appareil d'un point d'entrée. */
export function entryDevice(point: EntryPoint): GridPoint {
  if (point === "cron") return CRON_CLOCK;
  return { x: CONSOLE.x + CONSOLE.width / 2, y: CONSOLE.y + 0.45 + (point === "api" ? 0 : ENTRY_SPACING) };
}

/** La base de commandes de ton application : seul ton code y a accès, jamais l'agent. */
export const ORDERS_DB = { x: 0.35, y: 9.4, width: 0.9, depth: 1.2, height: 1.15 } as const;
/** Où ton code se place pour interroger la base de commandes. */
export const ORDERS_STAND: GridPoint = { x: 1.85, y: 10 };

/** Là où attend le code de ton application entre deux appels d'outil. */
export const WORKER_HOME: GridPoint = { x: 2.5, y: 10.4 };

/** L'établi du bac à sable : là où tournent bash et les outils de fichiers, dans le conteneur. */
export const WORKBENCH = { x: 3.8, y: 0.35, width: 1.2, depth: 0.9, height: 0.6 } as const;
export const WORKBENCH_STAND: GridPoint = { x: 4.35, y: 1.9 };
/** La table de chevet où est posé le carnet de mémoire. */
export const NIGHTSTAND = { x: 0.4, y: 1.7, size: 0.6, height: 0.5 } as const;

/** La bibliothèque de skills, contre le mur du fond, et l'endroit où l'agent s'y tient. */
export const LIBRARY = { x: 1.65, y: 0.3, width: 1.5, depth: 0.45, height: 1.25 } as const;
export const LIBRARY_STAND: GridPoint = { x: 2.4, y: 1.4 };

/** Les services tiers, alignés au fond du monde extérieur : un par clé du vault, puis le web. */
export const SERVICE = { y: 2.8, size: 1, height: 0.3, spacing: 1.65, firstX: 6.9 } as const;
export const WEB_GLOBE: GridPoint = { x: 12.4, y: 3.3 };

export function servicePosition(key: KeyId): GridPoint {
  const index = KEY_CATALOG.findIndex((each) => each.id === key);
  return { x: SERVICE.firstX + index * SERVICE.spacing, y: SERVICE.y };
}

function serviceCenter(key: KeyId): GridPoint {
  const corner = servicePosition(key);
  return { x: corner.x + SERVICE.size / 2, y: corner.y + SERVICE.size / 2 };
}

const DESK_SPAN = 6;
/** Le milieu de la boîte de support : d'où partent les tickets, et où arrivent les effets des services tiers. */
export const DESK_CENTER: GridPoint = { x: DESK_ORIGIN.x + DESK_SPAN / 2, y: DESK_ORIGIN.y + DESK_SPAN / 2 };

export interface ScenePoint extends GridPoint {
  readonly z: number;
}

/** Le point de la scène d'où part, ou où arrive, un appel. */
export function placePoint(place: Place, agent: GridPoint): ScenePoint {
  switch (place) {
    case "agent":
      return { ...agent, z: 1.5 };
    case "app":
      return { x: RACK.x + 1.85, y: RACK.y + RACK.depth / 2, z: RACK.height + 1.2 };
    case "orders":
      return { x: ORDERS_DB.x + ORDERS_DB.width / 2, y: ORDERS_DB.y + ORDERS_DB.depth / 2, z: ORDERS_DB.height + 0.4 };
    case "webhook":
      return { ...entryDevice("webhook"), z: CONSOLE.height + 0.7 };
    case "cron":
      return { ...CRON_CLOCK, z: 1.1 };
    case "desk":
      return { ...DESK_CENTER, z: 0.9 };
    case "vault":
      return { x: VAULT.x + VAULT.size / 2, y: VAULT.y + VAULT.size / 2, z: VAULT.height + 0.5 };
    case "web":
      return { ...WEB_GLOBE, z: 1.2 };
    default:
      return { ...serviceCenter(place.slice("service:".length) as KeyId), z: SERVICE.height + 1.2 };
  }
}

const WALK_MS_PER_TILE = 190;
const MIN_WALK_MS = 260;
const RACK_STAND_DISTANCE = 0.75;
const TILE_STAND_OFFSET = 0.32;

/** Centre de l'emplacement d'un outil custom sur l'étagère. */
export function rackSlot(tool: ToolId): GridPoint {
  return { x: RACK.x + (rackIndex(tool) + 0.5) * RACK.slotWidth, y: RACK.y + RACK.depth / 2 };
}

/** Où le code de ton application se place pour prendre l'outil. */
export function rackStand(tool: ToolId): GridPoint {
  return { x: rackSlot(tool).x, y: RACK.y + RACK.depth + RACK_STAND_DISTANCE };
}

export function tileCenter(tileX: number, tileY: number): GridPoint {
  return { x: DESK_ORIGIN.x + tileX + 0.5, y: DESK_ORIGIN.y + tileY + 0.5 };
}

/** Juste derrière le centre de la case, pour que ce qui est posé apparaisse devant celui qui le pose. */
export function tileStand(tileX: number, tileY: number): GridPoint {
  const center = tileCenter(tileX, tileY);
  return { x: center.x - TILE_STAND_OFFSET, y: center.y - TILE_STAND_OFFSET };
}

export function travelMs(from: GridPoint, to: GridPoint): number {
  return Math.max(MIN_WALK_MS, Math.round(Math.hypot(to.x - from.x, to.y - from.y) * WALK_MS_PER_TILE));
}
