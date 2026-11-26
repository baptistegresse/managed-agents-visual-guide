import { describe, expect, test } from "vitest";
import { highlightFile, indentOf, type CodeToken } from "./highlight";
import { LOCALES } from "@/lib/i18n/locale";
import { allLessons } from "./index";
import type { CodeFile } from "./types";

function fileOf(...lines: string[]): CodeFile {
  return { name: "demo.ts", blocks: [{ id: "all", lines }] };
}

function tokens(...lines: string[]): CodeToken[] {
  return highlightFile(fileOf(...lines))[0].lines.flat();
}

/** La nature du morceau qui porte ce texte, aux espaces près : ils sont recollés aux noms voisins. */
function kindOf(all: readonly CodeToken[], text: string): string | undefined {
  return all.find((token) => token.text.trim() === text)?.kind;
}

describe("highlightFile", () => {
  test("colours keywords, strings and member names differently from plain names", () => {
    const all = tokens('const session = await client.beta.sessions.create("x");');

    expect(kindOf(all, "const")).toBe("keyword");
    expect(kindOf(all, "await")).toBe("keyword");
    expect(kindOf(all, "session")).toBe("plain");
    expect(kindOf(all, "sessions")).toBe("property");
    expect(all.some((token) => token.kind === "string" && token.text.includes("x"))).toBe(true);
  });

  test("a comment line is a comment from its first character to its last", () => {
    const all = tokens("  // 1. Une session : une exécution de l'agent.");

    expect(all.filter((token) => token.text.trim() !== "").every((token) => token.kind === "comment")).toBe(true);
  });

  test("an object key is a property, even when its name is also a keyword", () => {
    const all = tokens('  events: [{ type: "user.message", content: [] }],');

    expect(kindOf(all, "events")).toBe("property");
    expect(kindOf(all, "type")).toBe("property");
    expect(kindOf(all, "content")).toBe("property");
  });

  test("a type annotation is not mistaken for an object key", () => {
    const all = tokens("export async function POST(request: Request) {");

    expect(kindOf(all, "request")).toBe("plain");
    expect(kindOf(all, "POST")).toBe("name");
    expect(kindOf(all, "function")).toBe("keyword");
  });

  test("keeps every block and every line where it was, blank lines included", () => {
    const file: CodeFile = {
      name: "demo.ts",
      blocks: [
        { id: "a", lines: ["const a = 1;", ""] },
        { id: "b", lines: ["// fin", "return a;"] },
      ],
    };

    const blocks = highlightFile(file);

    expect(blocks.map((block) => block.id)).toEqual(["a", "b"]);
    expect(blocks.map((block) => block.lines.length)).toEqual([2, 2]);
    expect(blocks[0].lines[1]).toEqual([]);
  });

  test("never changes a single character of any lesson's code", () => {
    for (const lesson of LOCALES.flatMap((locale) => allLessons(locale))) {
      for (const file of lesson.files) {
        const blocks = highlightFile(file);

        file.blocks.forEach((block, position) => {
          const rendered = blocks[position].lines.map((line) => line.map((token) => token.text).join(""));
          expect(rendered, `${lesson.id} / ${file.name} / ${block.id}`).toEqual([...block.lines]);
        });
      }
    }
  });
});

describe("a file that is not TypeScript", () => {
  test("a Markdown file is read as Markdown: an apostrophe in a sentence does not start a string", () => {
    const file: CodeFile = {
      name: "skills/remboursement/SKILL.md",
      blocks: [{ id: "all", lines: ["# Rembourser un client", "Vérifie l'achat avant de rembourser, puis préviens l'équipe."] }],
    };

    const sentence = highlightFile(file)[0].lines[1];

    expect(sentence.some((token) => token.kind === "string")).toBe(false);
    expect(sentence.map((token) => token.text).join("")).toBe(file.blocks[0].lines[1]);
  });

  test("a file of an unknown kind is shown as plain text, unchanged", () => {
    const file: CodeFile = { name: "notes.inconnu", blocks: [{ id: "all", lines: ["const n'est pas du code ici"] }] };

    const [line] = highlightFile(file)[0].lines;

    expect(line).toEqual([{ kind: "plain", text: "const n'est pas du code ici" }]);
  });
});

describe("indentOf", () => {
  test("counts the spaces a line starts with, so its wrapped part can be aligned under the code", () => {
    const [line] = highlightFile(fileOf("      const result = await replyToTicket(event.input.ticket);"))[0].lines;

    expect(indentOf(line)).toBe(6);
  });

  test("is zero for a line that starts at the margin, and for a blank line", () => {
    const [first, blank] = highlightFile(fileOf("const a = 1;", ""))[0].lines;

    expect(indentOf(first)).toBe(0);
    expect(indentOf(blank)).toBe(0);
  });
});
