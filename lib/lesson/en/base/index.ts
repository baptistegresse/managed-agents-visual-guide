import type { Lesson } from "../../types";
import { ENVIRONMENT_LESSON } from "./environment";
import { SESSION_LESSON } from "./session";
import { TOOLS_LESSON } from "./tools";
import { VAULT_LESSON } from "./vault";
import { WHAT_LESSON } from "./what";

/**
 * The basics, in reading order: what an agent is, then its four building
 * blocks. Each chapter starts from the scene the previous one left behind.
 */
export const BASE_LESSONS: readonly Lesson[] = [WHAT_LESSON, ENVIRONMENT_LESSON, TOOLS_LESSON, SESSION_LESSON, VAULT_LESSON];
