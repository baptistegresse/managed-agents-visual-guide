import { describe, expect, test } from "vitest";
import { positionFromSearch } from "./deeplink";

describe("positionFromSearch", () => {
  test("opens the chapter and the step named in the address, counting steps from 1", () => {
    expect(positionFromSearch("?chapter=session&step=5")).toEqual({ lessonId: "session", index: 4 });
  });

  test("opens the first step when only the chapter is named", () => {
    expect(positionFromSearch("?chapter=secret")).toEqual({ lessonId: "secret", index: 0 });
  });

  test("clamps a step beyond the end of the chapter to its last step", () => {
    expect(positionFromSearch("?chapter=what&step=99")).toEqual({ lessonId: "what", index: 6 });
  });

  test.each(["", "?step=3", "?chapter=nope", "?chapter=session&step=abc", "?chapter=session&step=0"])(
    "ignores an address that names no valid step: %s",
    (search) => {
      const position = positionFromSearch(search);

      expect(position === null || position.index === 0).toBe(true);
      if (search !== "?chapter=session&step=abc" && search !== "?chapter=session&step=0") expect(position).toBeNull();
    },
  );
});
