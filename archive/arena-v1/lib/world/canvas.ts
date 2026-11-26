import { CANVAS_SIZE, EMPTY_CODE, NO_OWNER } from "@/lib/config";
import type { BoundingBox, Canvas, Conflict, PaintCell, Region } from "./types";

export function createCanvas(size: number = CANVAS_SIZE): Canvas {
  return {
    size,
    colors: EMPTY_CODE.repeat(size * size),
    owners: Array<number>(size * size).fill(NO_OWNER),
  };
}

function isInside(size: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function indexOf(size: number, x: number, y: number): number {
  return y * size + x;
}

/** Renvoie un nouveau canvas ; les cellules hors limites sont ignorées. */
export function paintCells(canvas: Canvas, cells: readonly PaintCell[], slot: number): Canvas {
  const colors = canvas.colors.split("");
  const owners = [...canvas.owners];
  for (const cell of cells) {
    if (!isInside(canvas.size, cell.x, cell.y)) continue;
    const index = indexOf(canvas.size, cell.x, cell.y);
    colors[index] = cell.code;
    owners[index] = slot;
  }
  return { size: canvas.size, colors: colors.join(""), owners };
}

export function clampRegion(region: Region, size: number): Region {
  const x = Math.max(0, region.x);
  const y = Math.max(0, region.y);
  const right = Math.min(size, region.x + region.width);
  const bottom = Math.min(size, region.y + region.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function rectToCells(region: Region, code: string, size: number): PaintCell[] {
  const clamped = clampRegion(region, size);
  return Array.from({ length: clamped.width * clamped.height }, (_, index) => ({
    x: clamped.x + (index % clamped.width),
    y: clamped.y + Math.floor(index / clamped.width),
    code,
  }));
}

/** Compte, par propriétaire, les cellules visées qui appartiennent à un autre agent encore actif. */
export function countConflicts(
  canvas: Canvas,
  cells: readonly PaintCell[],
  slot: number,
  activeSlots: ReadonlySet<number>,
): Conflict[] {
  const counts = new Map<number, number>();
  const visited = new Set<number>();
  for (const cell of cells) {
    if (!isInside(canvas.size, cell.x, cell.y)) continue;
    const index = indexOf(canvas.size, cell.x, cell.y);
    if (visited.has(index)) continue;
    visited.add(index);
    const owner = canvas.owners[index];
    if (owner === NO_OWNER || owner === slot || !activeSlots.has(owner)) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([owner, count]) => ({ slot: owner, count }))
    .sort((left, right) => left.slot - right.slot);
}

export function renderRegion(canvas: Canvas, region: Region): string {
  const clamped = clampRegion(region, canvas.size);
  return Array.from({ length: clamped.height }, (_, row) => {
    const start = indexOf(canvas.size, clamped.x, clamped.y + row);
    return canvas.colors.slice(start, start + clamped.width);
  }).join("\n");
}

export function countPixelsInRegion(canvas: Canvas, region: Region): Map<number, number> {
  const clamped = clampRegion(region, canvas.size);
  const counts = new Map<number, number>();
  for (let row = 0; row < clamped.height; row += 1) {
    for (let column = 0; column < clamped.width; column += 1) {
      const owner = canvas.owners[indexOf(canvas.size, clamped.x + column, clamped.y + row)];
      if (owner !== NO_OWNER) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
  }
  return counts;
}

export function countPixelsBySlot(canvas: Canvas): Map<number, number> {
  return countPixelsInRegion(canvas, { x: 0, y: 0, width: canvas.size, height: canvas.size });
}

export function boundingBox(cells: readonly PaintCell[]): BoundingBox | null {
  if (cells.length === 0) return null;
  return cells.reduce<BoundingBox>(
    (box, cell) => ({
      minX: Math.min(box.minX, cell.x),
      minY: Math.min(box.minY, cell.y),
      maxX: Math.max(box.maxX, cell.x),
      maxY: Math.max(box.maxY, cell.y),
    }),
    { minX: cells[0].x, minY: cells[0].y, maxX: cells[0].x, maxY: cells[0].y },
  );
}
