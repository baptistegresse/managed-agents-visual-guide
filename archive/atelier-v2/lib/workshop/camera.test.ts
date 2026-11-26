import { describe, expect, test } from "vitest";
import { cameraFor, frameAround, MAX_ZOOM, visibleFrame } from "./camera";

const VIEW = { x: -100, y: -50, width: 400, height: 300 };

describe("cameraFor", () => {
  test("framing the whole view leaves the scene untouched", () => {
    expect(cameraFor(VIEW, VIEW)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  test("zooms until the region fills the view, keeping its proportions", () => {
    const camera = cameraFor({ x: 0, y: 0, width: 200, height: 100 }, VIEW);

    expect(camera.scale).toBe(2);
  });

  test("puts the centre of the region at the centre of the view", () => {
    const region = { x: 50, y: 50, width: 200, height: 150 };

    const camera = cameraFor(region, VIEW);
    const centreX = ((region.x + region.width / 2 - VIEW.x) / VIEW.width) * camera.scale + camera.offsetX;
    const centreY = ((region.y + region.height / 2 - VIEW.y) / VIEW.height) * camera.scale + camera.offsetY;

    expect(centreX).toBeCloseTo(0.5);
    expect(centreY).toBeCloseTo(0.5);
  });

  test("never zooms past the limit, however small the region", () => {
    expect(cameraFor({ x: 0, y: 0, width: 4, height: 3 }, VIEW).scale).toBe(MAX_ZOOM);
  });

  test("never slides past the edges of the scene", () => {
    const corner = cameraFor({ x: -100, y: -50, width: 100, height: 75 }, VIEW);

    expect(corner.offsetX).toBe(0);
    expect(corner.offsetY).toBe(0);
  });
});

describe("frameAround", () => {
  test("wraps every corner of a box, from the floor to its top, with some margin", () => {
    const frame = frameAround({ x0: 0, y0: 0, x1: 2, y1: 2, height: 1 }, 10);

    // (0,0) est le coin du fond, (2,2) celui de devant ; la hauteur remonte le cadre.
    expect(frame.x).toBe(-56 - 10);
    expect(frame.width).toBe(112 + 20);
    expect(frame.y).toBe(-28 - 10);
    expect(frame.height).toBe(56 + 28 + 20);
  });
});

describe("visibleFrame", () => {
  test("is the whole view when nothing is zoomed", () => {
    expect(visibleFrame({ scale: 1, offsetX: 0, offsetY: 0 }, VIEW)).toEqual(VIEW);
  });

  test("is exactly the region the camera was asked to show, when it has the view's proportions", () => {
    const region = { x: 0, y: 25, width: 200, height: 150 };

    const frame = visibleFrame(cameraFor(region, VIEW), VIEW);

    expect(frame.x).toBeCloseTo(region.x);
    expect(frame.y).toBeCloseTo(region.y);
    expect(frame.width).toBeCloseTo(region.width);
    expect(frame.height).toBeCloseTo(region.height);
  });
});
