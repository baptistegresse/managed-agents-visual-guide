import { describe, expect, test } from "vitest";
import { boxFaces, depthOf, planeMatrix, project, TILE_HEIGHT, TILE_WIDTH, Z_UNIT } from "./projection";

describe("project", () => {
  test("puts the grid origin at the screen origin", () => {
    expect(project(0, 0)).toEqual({ x: 0, y: 0 });
  });

  test("moves right and down along x, left and down along y, straight up along z", () => {
    expect(project(1, 0)).toEqual({ x: TILE_WIDTH / 2, y: TILE_HEIGHT / 2 });
    expect(project(0, 1)).toEqual({ x: -TILE_WIDTH / 2, y: TILE_HEIGHT / 2 });
    expect(project(0, 0, 1)).toEqual({ x: 0, y: -Z_UNIT });
  });
});

describe("boxFaces", () => {
  test("returns the three visible faces as four-point polygons", () => {
    const faces = boxFaces({ x: 0, y: 0, z: 0, width: 1, depth: 1, height: 1 });

    for (const face of [faces.top, faces.left, faces.right]) {
      expect(face.split(" ")).toHaveLength(4);
    }
    expect(faces.top.startsWith(`0,${-Z_UNIT}`)).toBe(true);
  });
});

describe("depthOf", () => {
  test("orders objects from the back of the room to the front", () => {
    expect(depthOf({ x: 1, y: 1 })).toBeLessThan(depthOf({ x: 3, y: 2 }));
  });
});

describe("planeMatrix", () => {
  test("anchors the drawing at the projected origin and follows the face's axes", () => {
    const origin = { x: 2, y: 1, z: 1 };
    const anchor = project(origin.x, origin.y, origin.z);

    expect(planeMatrix("top", origin)).toBe(
      `matrix(${TILE_WIDTH / 2} ${TILE_HEIGHT / 2} ${-TILE_WIDTH / 2} ${TILE_HEIGHT / 2} ${anchor.x} ${anchor.y})`,
    );
    expect(planeMatrix("left", origin)).toContain(`0 ${-Z_UNIT} ${anchor.x} ${anchor.y}`);
    expect(planeMatrix("right", origin).startsWith(`matrix(${-TILE_WIDTH / 2} ${TILE_HEIGHT / 2}`)).toBe(true);
  });
});
