import type { Lesson } from "../types";
import { BUDGET_LESSON } from "./budget";
import { COMPACTION_LESSON } from "./compaction";
import { CONTAINER_LESSON } from "./container";
import { CRON_LESSON } from "./cron";
import { DELEGATION_LESSON } from "./delegation";
import { FAULTS_LESSON } from "./faults";
import { INTERRUPT_LESSON } from "./interrupt";
import { MEMORY_LESSON } from "./memory";
import { OUTCOME_LESSON } from "./outcome";
import { RESUME_LESSON } from "./resume";
import { SECRET_LESSON } from "./secret";
import { SKILL_LESSON } from "./skill";
import { TURNS_LESSON } from "./turns";
import { VAULT_LESSON } from "./vault";
import { VERSIONS_LESSON } from "./versions";
import { WEB_LESSON } from "./web";
import { WEBHOOK_LESSON } from "./webhook";

/** Les chapitres « Aller plus loin » : un sujet chacun, à ouvrir après le scénario principal. */
export const EXTRA_LESSONS: readonly Lesson[] = [
  WEBHOOK_LESSON,
  CRON_LESSON,
  TURNS_LESSON,
  RESUME_LESSON,
  INTERRUPT_LESSON,
  VAULT_LESSON,
  CONTAINER_LESSON,
  SECRET_LESSON,
  BUDGET_LESSON,
  COMPACTION_LESSON,
  MEMORY_LESSON,
  DELEGATION_LESSON,
  OUTCOME_LESSON,
  FAULTS_LESSON,
  VERSIONS_LESSON,
  WEB_LESSON,
  SKILL_LESSON,
];
