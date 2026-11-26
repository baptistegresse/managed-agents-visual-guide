import { describe, expect, test } from "vitest";
import { coversMovers } from "./depth";

const ITEM = { x: 8, y: 8 };

describe("coversMovers", () => {
  test("nothing moving nearby means nothing to cover", () => {
    expect(coversMovers(ITEM, [])).toBe(false);
    expect(coversMovers(ITEM, [{ x: 2, y: 10 }])).toBe(false);
  });

  test("an item covers someone standing just behind it", () => {
    expect(coversMovers(ITEM, [{ x: 7.6, y: 7.6 }])).toBe(true);
  });

  test("an item does not cover someone standing in front of it", () => {
    expect(coversMovers(ITEM, [{ x: 8.5, y: 8.5 }])).toBe(false);
  });

  test("caught between two movers, it stays underneath rather than hide the nearer one", () => {
    expect(coversMovers(ITEM, [{ x: 7.6, y: 7.6 }, { x: 8.5, y: 8.5 }])).toBe(false);
  });
});
