import { Suspense } from "react";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";

export default function Home() {
  // La page lit son adresse (« ?chapter=…&step=… ») : elle se rend côté navigateur.
  return (
    <Suspense>
      <LessonPlayer initialLocale="fr" />
    </Suspense>
  );
}
