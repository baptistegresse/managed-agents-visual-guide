import { describe, expect, test } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALES, localeFromPath, localePath, otherLocales } from "./locale";
import { uiStrings, type UiStrings } from "./ui";

/** Every leaf of a dictionary, with functions called on sample arguments. */
function leaves(value: unknown, path: string): Array<readonly [string, unknown]> {
  if (typeof value === "function") return [[path, (value as (...args: unknown[]) => unknown)(2, "Titre", 3)]];
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
  }
  return [[path, value]];
}

function keysOf(strings: UiStrings): string[] {
  return leaves(strings, "ui").map(([path]) => path);
}

describe("locales", () => {
  test("French is the default, English is the other choice", () => {
    expect(DEFAULT_LOCALE).toBe("fr");
    expect(LOCALES).toEqual(["fr", "en"]);
    expect(otherLocales("fr")).toEqual(["en"]);
  });

  test("only known codes are locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  test("the default locale lives at the root, the others under their code", () => {
    expect(localePath("fr")).toBe("/");
    expect(localePath("en")).toBe("/en");
  });

  test("reads the locale back from a path, and falls back to the default", () => {
    expect(localeFromPath("/en")).toBe("en");
    expect(localeFromPath("/en/")).toBe("en");
    expect(localeFromPath("/")).toBe("fr");
    expect(localeFromPath("/english")).toBe("fr");
  });
});

describe("interface strings", () => {
  test.each(LOCALES)("%s has no empty string", (locale) => {
    for (const [path, value] of leaves(uiStrings(locale), "ui")) {
      expect(typeof value, path).toBe("string");
      expect((value as string).trim().length, path).toBeGreaterThan(0);
    }
  });

  test("both languages define exactly the same keys", () => {
    expect(keysOf(uiStrings("en"))).toEqual(keysOf(uiStrings("fr")));
  });

  test("the two languages do not share their sentences", () => {
    const french = uiStrings("fr");
    const english = uiStrings("en");

    expect(english.player.tagline).not.toBe(french.player.tagline);
    expect(english.step.back).not.toBe(french.step.back);
  });

  test("counts are spelled in the singular and the plural", () => {
    expect(uiStrings("fr").scene.vault(1)).toBe("Vault · 1 clé");
    expect(uiStrings("fr").scene.vault(2)).toBe("Vault · 2 clés");
    expect(uiStrings("en").scene.vault(1)).toBe("Vault · 1 key");
    expect(uiStrings("en").scene.vault(0)).toBe("Vault · 0 keys");
  });
});
