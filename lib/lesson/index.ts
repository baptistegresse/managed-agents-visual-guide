import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { BASE_LESSONS } from "./base";
import { BASE_LESSONS as ENGLISH_BASE_LESSONS } from "./en/base";
import { EXTRA_LESSONS as ENGLISH_EXTRA_LESSONS } from "./en/extras";
import { EXTRA_LESSONS } from "./extras";
import type { Lesson } from "./types";

export { BASE_LESSONS, EXTRA_LESSONS };

/** Toutes les leçons en français, l'original : les bases d'abord, puis les annexes. */
export const LESSONS: readonly Lesson[] = [...BASE_LESSONS, ...EXTRA_LESSONS];

/** Les leçons d'une langue : mêmes chapitres, mêmes étapes, seul le texte change. */
export interface Catalog {
  readonly bases: readonly Lesson[];
  readonly extras: readonly Lesson[];
}

const CATALOGS: Readonly<Record<Locale, Catalog>> = {
  fr: { bases: BASE_LESSONS, extras: EXTRA_LESSONS },
  en: { bases: ENGLISH_BASE_LESSONS, extras: ENGLISH_EXTRA_LESSONS },
};

export function catalog(locale: Locale = DEFAULT_LOCALE): Catalog {
  return CATALOGS[locale];
}

export function allLessons(locale: Locale = DEFAULT_LOCALE): readonly Lesson[] {
  const { bases, extras } = catalog(locale);
  return [...bases, ...extras];
}

/** La leçon qui porte cet identifiant ; à défaut, le tout premier chapitre. */
export function lessonById(id: string, locale: Locale = DEFAULT_LOCALE): Lesson {
  return allLessons(locale).find((lesson) => lesson.id === id) ?? catalog(locale).bases[0];
}

/** Le chapitre de base qui suit celui-ci ; `null` après le dernier, ou pour une annexe. */
export function nextBaseLesson(id: string, locale: Locale = DEFAULT_LOCALE): Lesson | null {
  const { bases } = catalog(locale);
  const position = bases.findIndex((lesson) => lesson.id === id);
  return position === -1 ? null : (bases[position + 1] ?? null);
}

export function isBaseLesson(id: string): boolean {
  return BASE_LESSONS.some((lesson) => lesson.id === id);
}
