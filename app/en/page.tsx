import type { Metadata } from "next";
import { Suspense } from "react";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { uiStrings } from "@/lib/i18n/ui";

export const metadata: Metadata = uiStrings("en").meta;

export default function EnglishHome() {
  // La page lit son adresse (« ?chapter=…&step=… ») : elle se rend côté navigateur.
  return (
    <Suspense>
      <LessonPlayer initialLocale="en" />
    </Suspense>
  );
}
