"use client";

import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/locale";
import { useUi } from "@/components/i18n/LocaleContext";

interface LocaleSwitchProps {
  locale: Locale;
  onChange: (locale: Locale) => void;
}

/** Le choix de la langue : un bouton par langue, celui de la langue en cours est enfoncé. */
export function LocaleSwitch({ locale, onChange }: LocaleSwitchProps) {
  const ui = useUi();
  return (
    <div role="group" aria-label={ui.player.language} className="flex overflow-hidden rounded-full border border-line text-xs">
      {LOCALES.map((each) => (
        <button
          key={each}
          type="button"
          lang={each}
          title={LOCALE_NAMES[each]}
          aria-label={LOCALE_NAMES[each]}
          aria-pressed={each === locale}
          onClick={() => onChange(each)}
          className={`px-2.5 py-0.5 font-medium uppercase transition ${
            each === locale ? "bg-ink text-white" : "bg-panel text-muted hover:text-ink"
          }`}
        >
          {each}
        </button>
      ))}
    </div>
  );
}
