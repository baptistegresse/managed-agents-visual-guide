import { project } from "@/lib/iso/projection";

/** Un rectangle de la scène, en pixels de son repère. */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Un pavé de la scène, en cases : ce qu'on veut voir en entier quand on zoome dessus. */
export interface GridBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly height: number;
}

/**
 * Le cadrage à appliquer à la scène : un agrandissement, puis un décalage exprimé
 * en fraction de sa taille (c'est ce qu'attend `translate(…%)` en CSS).
 */
export interface Camera {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Au-delà, les objets deviennent trop gros pour qu'on garde le fil. */
export const MAX_ZOOM = 2.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Le cadrage qui montre `region` au centre de la vue, aussi grand que possible, sans sortir de la scène. */
export function cameraFor(region: Frame, view: Frame): Camera {
  const scale = Math.min(MAX_ZOOM, view.width / region.width, view.height / region.height);
  const centreX = (region.x + region.width / 2 - view.x) / view.width;
  const centreY = (region.y + region.height / 2 - view.y) / view.height;
  // `+ 0` : un décalage nul doit valoir 0, jamais -0.
  return {
    scale,
    offsetX: clamp(0.5 - scale * centreX, 1 - scale, 0) + 0,
    offsetY: clamp(0.5 - scale * centreY, 1 - scale, 0) + 0,
  };
}

/** Le rectangle de la scène qui contient tout le pavé, du sol à son sommet, avec une marge. */
export function frameAround(box: GridBox, padding: number): Frame {
  const corners = [
    project(box.x0, box.y0),
    project(box.x1, box.y0),
    project(box.x0, box.y1),
    project(box.x1, box.y1),
    project(box.x0, box.y0, box.height),
    project(box.x1, box.y0, box.height),
    project(box.x0, box.y1, box.height),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding;
  return { x: left, y: top, width: Math.max(...xs) + padding - left, height: Math.max(...ys) + padding - top };
}

/** Ce que la caméra montre réellement de la scène, une fois son cadrage appliqué. */
export function visibleFrame(camera: Camera, view: Frame): Frame {
  return {
    x: view.x - (camera.offsetX / camera.scale) * view.width,
    y: view.y - (camera.offsetY / camera.scale) * view.height,
    width: view.width / camera.scale,
    height: view.height / camera.scale,
  };
}
