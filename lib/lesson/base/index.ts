import type { Lesson } from "../types";
import { ENVIRONMENT_LESSON } from "./environment";
import { SESSION_LESSON } from "./session";
import { TOOLS_LESSON } from "./tools";
import { VAULT_LESSON } from "./vault";
import { WHAT_LESSON } from "./what";

/**
 * Les bases, dans l'ordre où on les lit : ce qu'est un agent, puis ses quatre
 * briques. Chaque chapitre repart de la scène que le précédent a laissée.
 */
export const BASE_LESSONS: readonly Lesson[] = [WHAT_LESSON, ENVIRONMENT_LESSON, TOOLS_LESSON, SESSION_LESSON, VAULT_LESSON];
