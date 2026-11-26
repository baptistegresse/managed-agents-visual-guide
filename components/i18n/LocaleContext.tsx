"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import { uiStrings, type UiStrings } from "@/lib/i18n/ui";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Donne la langue choisie à toute la page. */
export const LocaleProvider = LocaleContext.Provider;

/** Le texte de l'interface, dans la langue choisie. */
export function useUi(): UiStrings {
  return uiStrings(useContext(LocaleContext));
}
