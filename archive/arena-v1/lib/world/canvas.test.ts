import { describe, expect, test } from "vitest";
import { NO_OWNER } from "@/lib/config";
import {
  boundingBox,
  clampRegion,
  countConflicts,
  countPixelsBySlot,
  createCanvas,
  paintCells,
  rectToCells,
  renderRegion,
} from "./canvas";

describe("createCanvas", () => {
  test("creates an empty canvas with no owners", () => {
    const canvas = createCanvas(4);

    expect(canvas.colors).toBe(".".repeat(16));
    expect(canvas.owners).toEqual(Array(16).fill(NO_OWNER));
  });
});

describe("paintCells", () => {
  test("paints cells and records their owner without mutating the original", () => {
    const original = createCanvas(4);

    const painted = paintCells(original, [{ x: 1, y: 2, code: "R" }], 3);

    expect(renderRegion(painted, { x: 0, y: 0, width: 4, height: 4 })).toBe(
      "....\n....\n.R..\n....",
    );
    expect(painted.owners[2 * 4 + 1]).toBe(3);
    expect(original.colors).toBe(".".repeat(16));
  });

  test("ignores cells outside the canvas", () => {
    const canvas = createCanvas(2);

    const painted = paintCells(canvas, [{ x: 5, y: 0, code: "R" }], 0);

    expect(painted.colors).toBe("....");
  });
});

describe("rectToCells", () => {
  test("clips a rectangle that overflows the canvas", () => {
    const cells = rectToCells({ x: 2, y: 2, width: 5, height: 5 }, "B", 4);

    expect(cells).toHaveLength(4);
    expect(cells.every((cell) => cell.x < 4 && cell.y < 4)).toBe(true);
  });
});

describe("countConflicts", () => {
  test("counts cells owned by other active agents", () => {
    const canvas = paintCells(
      paintCells(createCanvas(4), rectToCells({ x: 0, y: 0, width: 2, height: 1 }, "R", 4), 1),
      [{ x: 3, y: 3, code: "B" }],
      2,
    );
    const attempt = rectToCells({ x: 0, y: 0, width: 4, height: 4 }, "Y", 4);

    const conflicts = countConflicts(canvas, attempt, 0, new Set([0, 1, 2]));

    expect(conflicts).toEqual([
      { slot: 1, count: 2 },
      { slot: 2, count: 1 },
    ]);
  });

  test("does not count own cells nor cells of retired agents", () => {
    const canvas = paintCells(
      paintCells(createCanvas(2), [{ x: 0, y: 0, code: "R" }], 0),
      [{ x: 1, y: 1, code: "B" }],
      1,
    );
    const attempt = rectToCells({ x: 0, y: 0, width: 2, height: 2 }, "Y", 2);

    const conflicts = countConflicts(canvas, attempt, 0, new Set([0]));

    expect(conflicts).toEqual([]);
  });
});

describe("helpers", () => {
  test("clampRegion keeps a region inside the canvas", () => {
    expect(clampRegion({ x: -2, y: 60, width: 10, height: 10 }, 64)).toEqual({
      x: 0,
      y: 60,
      width: 8,
      height: 4,
    });
  });

  test("boundingBox returns null for no cells and the hull otherwise", () => {
    expect(boundingBox([])).toBeNull();
    expect(
      boundingBox([
        { x: 3, y: 9, code: "R" },
        { x: 1, y: 4, code: "R" },
      ]),
    ).toEqual({ minX: 1, minY: 4, maxX: 3, maxY: 9 });
  });

  test("countPixelsBySlot counts owned cells per agent", () => {
    const canvas = paintCells(createCanvas(2), rectToCells({ x: 0, y: 0, width: 2, height: 1 }, "R", 2), 4);

    expect(countPixelsBySlot(canvas).get(4)).toBe(2);
  });
});
