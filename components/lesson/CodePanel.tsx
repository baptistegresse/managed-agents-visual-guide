"use client";

import { useEffect, useMemo, useRef } from "react";
import { highlightFile, indentOf, type TokenKind } from "@/lib/lesson/highlight";
import type { CodeFile, CodeFocus } from "@/lib/lesson/types";
import { useUi } from "@/components/i18n/LocaleContext";

interface CodePanelProps {
  files: readonly CodeFile[];
  focus: CodeFocus;
  /** Change à chaque étape : c'est ce qui fait défiler jusqu'au code concerné. */
  stepId: string;
}

/** Les couleurs d'un éditeur sombre : une par nature de morceau de code. */
const TOKEN_CLASSES: Readonly<Record<TokenKind, string>> = {
  plain: "text-[#f1e9dc]",
  keyword: "text-[#f29e8a]",
  string: "text-[#a8d5a2]",
  comment: "italic text-[#9a9388]",
  name: "text-[#f2cc6b]",
  property: "text-[#8fc4ea]",
  sign: "text-[#b9b2a6]",
};

/** Retrait supplémentaire de la suite d'une ligne trop longue, en caractères. */
const WRAP_INDENT = 4;

/**
 * Une ligne trop longue passe à la ligne au lieu de faire défiler le cadre : sa
 * suite se range en retrait, sous le code et non sous la marge.
 */
function hangingIndent(indent: number): { paddingLeft: string; textIndent: string } {
  const hang = indent + WRAP_INDENT;
  return { paddingLeft: `${hang}ch`, textIndent: `-${hang}ch` };
}

/**
 * Le code du backend, coloré comme dans un éditeur. Le fichier de l'étape est
 * affiché en entier ; les blocs dont elle parle sont éclairés, le reste s'efface.
 */
export function CodePanel({ files, focus, stepId }: CodePanelProps) {
  const ui = useUi();
  const file = files.find((each) => each.name === focus.file) ?? files[0];
  const blocks = useMemo(() => highlightFile(file), [file]);
  const firstLit = useRef<HTMLDivElement>(null);

  useEffect(() => {
    firstLit.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [stepId]);

  const firstLitId = blocks.find((block) => focus.blocks.includes(block.id))?.id;
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-night">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="text-xs uppercase tracking-wide text-white/45">{ui.code.owner}</span>
        <span className="font-mono text-xs text-[#f1e9dc]">{file.name}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-3 font-mono text-[12px] leading-relaxed">
        {blocks.map((block) => {
          const isLit = focus.blocks.includes(block.id);
          return (
            <div
              key={block.id}
              ref={block.id === firstLitId ? firstLit : undefined}
              className={`border-l-2 px-4 transition-[opacity,background-color] duration-300 ${
                isLit ? "border-coral bg-white/[0.07]" : "border-transparent opacity-35"
              }`}
            >
              {block.lines.map((line, position) => (
                <pre key={position} className="whitespace-pre-wrap break-words" style={hangingIndent(indentOf(line))}>
                  {line.length === 0
                    ? " "
                    : line.map((token, index) => (
                        <span key={index} className={TOKEN_CLASSES[token.kind]}>
                          {token.text}
                        </span>
                      ))}
                </pre>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
