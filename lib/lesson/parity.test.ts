import { describe, expect, test } from "vitest";
import { allLessons } from "./index";
import { lessonView, stepCount, type LessonView } from "./play";
import type { CodeFile, Lesson } from "./types";

const FRENCH = allLessons("fr");
const ENGLISH = allLessons("en");
const PAIRS = FRENCH.map((lesson, position) => [lesson.id, lesson, ENGLISH[position]] as const);

/** Keys whose value is structure, not prose: they must be identical in both languages. */
const STRUCTURAL_KEYS: ReadonlySet<string> = new Set([
  "type",
  "origin",
  "from",
  "to",
  "tone",
  "mood",
  "status",
  "key",
  "point",
  "spot",
  "phase",
  "who",
]);
const PROSE = "·";

/** An action with its prose blanked out: what is left is what happens, not how it is worded. */
function skeleton(value: unknown, key = "", owner: Record<string, unknown> = {}): unknown {
  if (typeof value === "string") {
    const isEventName = key === "name" && owner.type === "event";
    return STRUCTURAL_KEYS.has(key) || isEventName ? value : PROSE;
  }
  if (Array.isArray(value)) return value.map((item) => skeleton(item, key, owner));
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(record).map(([name, child]) => [name, skeleton(child, name, record)]));
  }
  return value;
}

/** What a file shows of the SDK: every call and every wire-level type string, in order. */
function apiSurface(file: CodeFile): string[] {
  const code = file.blocks.flatMap((block) => block.lines).join("\n");
  return code.match(/client\.[\w.]+|\btype: "[\w.]+"|\btype === "[\w.]+"/g) ?? [];
}

/** What the screen shows once a step has played, without any prose. */
function screen(view: LessonView): unknown {
  const { run } = view;
  return {
    events: run.events.map((line) => [line.name, line.origin, line.isError]),
    status: run.status,
    actor: [run.actor.position, run.actor.mood, run.actor.bubble !== null],
    hop: run.hop && [run.hop.from, run.hop.to, run.hop.tone],
    key: run.activeKey,
    entry: run.activeEntry,
    spot: run.activeSpot,
    verdict: run.verdict?.tone ?? null,
    isWaitingForApproval: run.approval !== null,
    terminalLines: run.terminal?.length ?? null,
    fileCount: run.files.length,
    noteCount: run.memory.length,
    helperCount: run.helpers.length,
    outcome: run.outcome && [run.outcome.phase, run.outcome.iteration, run.outcome.criteria.map((each) => each.isMet)],
    budget: [run.budgetCents, run.spentCents],
    pile: run.context.blocks.map((block) => block.kind),
    compactionCount: run.context.compactionCount,
    pieces: [...view.pieces],
    facts: view.facts,
  };
}

/** Every string a reader can see in a lesson. */
function proseOf(lesson: Lesson): string[] {
  const strings = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (typeof value === "object" && value !== null) return Object.values(value).flatMap(strings);
    return [];
  };
  return strings({ title: lesson.title, summary: lesson.summary, steps: lesson.steps, files: lesson.files });
}

/** Words that only French uses: one of them in an English lesson is a sentence left untranslated. */
const FRENCH_WORDS = /(^|[\s«(])(les|une|est|ton|avec|dans|qui|que|pour|sont|cette|mais|chez|vers)(?=[\s,.:;!?»)]|$)/i;

describe("the English lessons mirror the French ones", () => {
  test("same chapters, in the same order", () => {
    expect(ENGLISH.map((lesson) => lesson.id)).toEqual(FRENCH.map((lesson) => lesson.id));
  });

  test.each(PAIRS)("%s has the same steps, lighting the same code", (_id, french, english) => {
    expect(english.steps.map((step) => step.id)).toEqual(french.steps.map((step) => step.id));
    french.steps.forEach((step, position) => {
      const other = english.steps[position];
      const fileRank = (lesson: Lesson, name: string): number => lesson.files.findIndex((file) => file.name === name);

      expect(other.code.blocks, step.id).toEqual(step.code.blocks);
      expect(fileRank(english, other.code.file), step.id).toBe(fileRank(french, step.code.file));
      expect(other.text.length, step.id).toBe(step.text.length);
    });
  });

  test.each(PAIRS)("%s shows the same code: same blocks, same lines, same SDK calls", (_id, french, english) => {
    expect(english.files.length).toBe(french.files.length);
    french.files.forEach((file, position) => {
      const other = english.files[position];

      expect(other.blocks.map((block) => [block.id, block.lines.length])).toEqual(
        file.blocks.map((block) => [block.id, block.lines.length]),
      );
      expect(apiSurface(other), file.name).toEqual(apiSurface(file));
    });
  });

  test.each(PAIRS)("%s changes the scene the same way at every step", (_id, french, english) => {
    const changes = (lesson: Lesson): unknown =>
      [lesson.before ?? {}, ...lesson.steps].map((change) => ({
        adds: change.adds ?? [],
        sets: change.sets ?? {},
        actions: skeleton(change.actions ?? []),
      }));

    expect(changes(english)).toEqual(changes(french));
  });

  test.each(PAIRS)("%s plays the same on screen, step after step", (_id, french, english) => {
    for (let index = 0; index < stepCount(french); index += 1) {
      expect(screen(lessonView(english, index)), french.steps[index].id).toEqual(screen(lessonView(french, index)));
    }
  });

  test.each(PAIRS)("%s is really translated: no sentence left in French", (_id, french, english) => {
    const sentences = (lesson: Lesson): string[] => [
      lesson.title,
      lesson.summary,
      ...lesson.steps.flatMap((step) => [step.title, ...step.text]),
    ];
    const frenchSentences = new Set(sentences(french));

    for (const sentence of sentences(english)) expect(frenchSentences.has(sentence), sentence).toBe(false);
    for (const text of proseOf(english)) expect(FRENCH_WORDS.test(text), text).toBe(false);
  });
});
