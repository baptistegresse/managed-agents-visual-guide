/** Projection isométrique 2:1 : une case fait TILE_WIDTH × TILE_HEIGHT pixels à l'écran. */
export const TILE_WIDTH = 56;
export const TILE_HEIGHT = 28;
/** Hauteur à l'écran d'une unité verticale. */
export const Z_UNIT = 28;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

export interface BoxFaces {
  readonly top: string;
  readonly left: string;
  readonly right: string;
}

/** x part vers la droite et le bas, y vers la gauche et le bas, z vers le haut. */
export function project(x: number, y: number, z = 0): ScreenPoint {
  return {
    x: ((x - y) * TILE_WIDTH) / 2,
    y: ((x + y) * TILE_HEIGHT) / 2 - z * Z_UNIT,
  };
}

function toPoints(corners: ReadonlyArray<readonly [number, number, number]>): string {
  return corners
    .map(([x, y, z]) => project(x, y, z))
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

/** Les trois faces visibles d'un pavé, prêtes pour l'attribut `points` d'un polygone SVG. */
export function boxFaces(box: Box): BoxFaces {
  const { x, y, z, width, depth, height } = box;
  const top = z + height;
  return {
    top: toPoints([
      [x, y, top],
      [x + width, y, top],
      [x + width, y + depth, top],
      [x, y + depth, top],
    ]),
    left: toPoints([
      [x, y + depth, top],
      [x + width, y + depth, top],
      [x + width, y + depth, z],
      [x, y + depth, z],
    ]),
    right: toPoints([
      [x + width, y, top],
      [x + width, y + depth, top],
      [x + width, y + depth, z],
      [x + width, y, z],
    ]),
  };
}

/** Plus la valeur est grande, plus l'objet est devant : on dessine dans l'ordre croissant. */
export function depthOf(point: GridPoint): number {
  return point.x + point.y;
}

export type Plane = "top" | "left" | "right";

/**
 * Matrice SVG qui plaque un dessin 2D (en cases) sur une face : `top` = le dessus,
 * `left` = la face tournée vers le bas-gauche, `right` = celle tournée vers le bas-droite.
 * Sur les faces verticales, le second axe du dessin monte.
 */
export function planeMatrix(plane: Plane, origin: { x: number; y: number; z: number }): string {
  const anchor = project(origin.x, origin.y, origin.z);
  const alongX = [TILE_WIDTH / 2, TILE_HEIGHT / 2];
  const alongY = [-TILE_WIDTH / 2, TILE_HEIGHT / 2];
  const up = [0, -Z_UNIT];
  const [first, second] =
    plane === "top" ? [alongX, alongY] : plane === "left" ? [alongX, up] : [alongY, up];
  return `matrix(${first[0]} ${first[1]} ${second[0]} ${second[1]} ${anchor.x} ${anchor.y})`;
}
