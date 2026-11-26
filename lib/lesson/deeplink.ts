import { z } from "zod";
import { allLessons } from "./index";

/** Où ouvrir la page : un chapitre, et une étape de ce chapitre. */
export interface LessonPosition {
  readonly lessonId: string;
  readonly index: number;
}

const stepSchema = z.coerce.number().int().min(1);

/**
 * Lit « ?chapter=session&step=5 » dans une adresse : le chapitre par son
 * identifiant, l'étape comptée à partir de 1. Renvoie `null` si l'adresse ne
 * nomme aucun chapitre connu ; une étape absente ou invalide ouvre la première.
 */
export function positionFromSearch(search: string): LessonPosition | null {
  const params = new URLSearchParams(search);
  const lesson = allLessons().find((each) => each.id === params.get("chapter"));
  if (!lesson) return null;
  const step = stepSchema.safeParse(params.get("step") ?? undefined);
  const index = step.success ? Math.min(step.data, lesson.steps.length) - 1 : 0;
  return { lessonId: lesson.id, index };
}
