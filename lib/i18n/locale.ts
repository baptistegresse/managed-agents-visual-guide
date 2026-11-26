/** Les langues du site. Le français est l'original ; l'anglais en est la traduction. */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Le nom de chaque langue, dans cette langue : c'est ce qu'affiche le sélecteur. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { fr: "Français", en: "English" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function otherLocales(locale: Locale): readonly Locale[] {
  return LOCALES.filter((each) => each !== locale);
}

/** L'adresse de la page dans cette langue : la racine pour le français, « /en » pour l'anglais. */
export function localePath(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}`;
}

/** La langue qu'annonce une adresse ; le français quand elle n'en annonce aucune. */
export function localeFromPath(path: string): Locale {
  const [first] = path.split("/").filter(Boolean);
  return isLocale(first) ? first : DEFAULT_LOCALE;
}
