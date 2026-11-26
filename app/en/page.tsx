import type { Metadata } from "next";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { uiStrings } from "@/lib/i18n/ui";

export const metadata: Metadata = uiStrings("en").meta;

export default function EnglishHome() {
  return <LessonPlayer initialLocale="en" />;
}
