import { depthOf, type GridPoint } from "@/lib/iso/projection";

/** En deçà de cette distance, en cases, deux objets se chevauchent à l'écran. */
const OVERLAP_DISTANCE = 1.3;

/**
 * Vrai si l'objet posé en `at` doit être repeint par-dessus ceux qui se
 * déplacent près de lui : il est devant chacun d'eux. Cela évite de réordonner
 * la scène à chaque pas, ce qui relancerait les animations.
 */
export function coversMovers(at: GridPoint, movers: readonly GridPoint[]): boolean {
  const near = movers.filter(
    (mover) => Math.abs(mover.x - at.x) < OVERLAP_DISTANCE && Math.abs(mover.y - at.y) < OVERLAP_DISTANCE,
  );
  return near.length > 0 && near.every((mover) => depthOf(mover) < depthOf(at));
}
