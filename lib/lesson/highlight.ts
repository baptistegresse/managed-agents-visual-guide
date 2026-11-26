import { parse, type ParsedToken, type ParseOptions, type TokenType } from "sugar-high/core";
import { lang, languages } from "sugar-high/lang";
import type { CodeFile } from "./types";

/** La nature d'un morceau de code, pour le colorer comme dans un éditeur. */
export type TokenKind = "plain" | "keyword" | "string" | "comment" | "name" | "property" | "sign";

export interface CodeToken {
  readonly kind: TokenKind;
  readonly text: string;
}

export type CodeLine = readonly CodeToken[];

export interface HighlightedBlock {
  readonly id: string;
  readonly lines: readonly CodeLine[];
}

const KINDS: Readonly<Record<TokenType, TokenKind>> = {
  identifier: "plain",
  keyword: "keyword",
  string: "string",
  class: "name",
  entity: "name",
  property: "property",
  jsxliterals: "plain",
  sign: "sign",
  comment: "comment",
  break: "plain",
  space: "plain",
};

/** Les règles de lecture du langage d'un fichier, d'après son extension ; `null` si on ne le connaît pas. */
function grammarOf(fileName: string): ParseOptions | null {
  const extension = fileName.split(".").at(-1) ?? "";
  const id = lang(extension);
  return languages.find((language) => language.id === id)?.config ?? null;
}

/** Ce qui précède une clé d'objet : une accolade ouvrante, une virgule, ou rien sur la ligne. */
const BEFORE_KEY: ReadonlySet<string> = new Set(["{", ","]);

function isBlank(token: CodeToken): boolean {
  return token.text.trim() === "";
}

/** Le premier morceau non vide à partir de `from`, en avançant ou en reculant. */
function neighbour(line: CodeLine, from: number, step: 1 | -1): CodeToken | undefined {
  for (let position = from + step; position >= 0 && position < line.length; position += step) {
    if (!isBlank(line[position])) return line[position];
  }
  return undefined;
}

/** Une clé d'objet (`type: …`) est une propriété, même si son nom est aussi un mot-clé du langage. */
function isObjectKey(line: CodeLine, position: number): boolean {
  const token = line[position];
  if (token.kind !== "plain" && token.kind !== "keyword") return false;
  if (neighbour(line, position, 1)?.text !== ":") return false;
  const before = neighbour(line, position, -1);
  return before === undefined || BEFORE_KEY.has(before.text);
}

/** Recolle les morceaux voisins de même nature : moins d'éléments à dessiner, même texte. */
function merged(line: CodeLine): CodeToken[] {
  return line.reduce<CodeToken[]>((tokens, token) => {
    const last = tokens.at(-1);
    if (last && last.kind === token.kind) return [...tokens.slice(0, -1), { kind: last.kind, text: last.text + token.text }];
    return [...tokens, token];
  }, []);
}

function colourLine(parsed: readonly ParsedToken[]): CodeToken[] {
  const line: CodeLine = parsed
    .filter((token) => token.value !== "")
    .map((token) => ({ kind: KINDS[token.type], text: token.value }));
  return merged(line.map((token, position) => (isObjectKey(line, position) ? { kind: "property", text: token.text } : token)));
}

/**
 * Colore un fichier comme le ferait un éditeur, selon son langage. Le fichier
 * est lu d'un seul tenant, pour qu'une chaîne ou un commentaire ne soit pas
 * coupé par la frontière d'un bloc ; chaque bloc retrouve ensuite ses lignes, à
 * l'identique. Un fichier d'un langage inconnu reste en texte brut.
 */
export function highlightFile(file: CodeFile): HighlightedBlock[] {
  const source = file.blocks.flatMap((block) => block.lines);
  const grammar = grammarOf(file.name);
  const lines: readonly CodeLine[] = grammar
    ? parse(source.join("\n"), grammar).lines.map((line) => colourLine(line.tokens))
    : source.map((line) => (line === "" ? [] : [{ kind: "plain", text: line }]));
  return file.blocks.reduce<{ blocks: HighlightedBlock[]; offset: number }>(
    (result, block) => ({
      blocks: [...result.blocks, { id: block.id, lines: lines.slice(result.offset, result.offset + block.lines.length) }],
      offset: result.offset + block.lines.length,
    }),
    { blocks: [], offset: 0 },
  ).blocks;
}

/** Le nombre d'espaces par lesquels une ligne commence : son retrait. */
export function indentOf(line: CodeLine): number {
  const text = line.map((token) => token.text).join("");
  return text.length - text.trimStart().length;
}
