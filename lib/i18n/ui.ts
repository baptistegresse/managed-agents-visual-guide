import type { EventOrigin } from "@/lib/workshop/effects";
import type { Locale } from "./locale";
import { UI_EN } from "./ui.en";
import { UI_FR } from "./ui.fr";

/** Tout le texte de l'interface, hors leçons : chaque langue en fournit une version complète. */
export interface UiStrings {
  readonly meta: {
    readonly title: string;
    readonly description: string;
  };
  readonly player: {
    readonly title: string;
    readonly tagline: string;
    readonly illustration: string;
    readonly sceneLabel: string;
    readonly language: string;
    readonly nextChapter: (title: string) => string;
    readonly openExtras: string;
  };
  readonly step: {
    readonly progress: (position: number, total: number) => string;
    readonly listLabel: string;
    readonly stepLabel: (position: number, title: string) => string;
    readonly back: string;
    readonly next: string;
    readonly end: string;
  };
  readonly chapters: {
    readonly label: string;
    readonly bases: string;
    readonly extras: string;
    readonly locked: string;
    readonly showNow: string;
  };
  readonly code: {
    readonly owner: string;
  };
  readonly events: {
    readonly title: string;
    readonly empty: string;
    readonly origins: Readonly<Record<EventOrigin, string>>;
  };
  readonly scene: {
    readonly label: string;
    readonly session: string;
    readonly room: string;
    readonly networkLimited: string;
    readonly networkOpen: string;
    readonly vault: (keyCount: number) => string;
    readonly context: string;
    readonly compacted: (times: number) => string;
    readonly container: string;
    readonly mountedFile: string;
    readonly memory: (noteCount: number) => string;
    readonly skills: string;
    readonly loading: string;
    readonly clock: string;
    readonly scheduled: string;
    readonly terminated: string;
    readonly retrying: string;
    readonly awaitingApproval: string;
    readonly agentName: string;
    readonly bareModel: string;
    readonly budget: string;
    readonly paused: string;
    readonly grader: (attempt: number, maxAttempts: number) => string;
  };
}

const STRINGS: Readonly<Record<Locale, UiStrings>> = { fr: UI_FR, en: UI_EN };

export function uiStrings(locale: Locale): UiStrings {
  return STRINGS[locale];
}
