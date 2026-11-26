"use client";

import { useEffect, useRef } from "react";
import { COMPACT_AT_SHARE, usedTokens, type BlockKind, type ContextWindow } from "@/lib/workshop/context";
import { BLOCK_COLORS } from "./scene/ContextStack";

const KIND_LABELS: Readonly<Record<BlockKind, string>> = {
  system: "consignes",
  tools: "outils",
  user: "message",
  assistant: "réponse",
  tool_use: "appel",
  tool_result: "résultat",
  summary: "résumé",
};

const PERCENT = 100;

interface ContextPanelProps {
  context: ContextWindow;
}

/**
 * La fenêtre de contexte, bloc par bloc : exactement ce que le modèle relit à
 * chaque requête. Les mêmes couleurs que la pile dessinée à côté de l'agent.
 */
export function ContextPanel({ context }: ContextPanelProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const used = usedTokens(context);
  const lastId = context.blocks.at(-1)?.id ?? 0;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastId]);

  return (
    <section className="flex max-h-72 min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel lg:max-h-none">
      <h2 className="flex shrink-0 items-baseline justify-between px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted">
        <span>Fenêtre de contexte</span>
        <span className="font-mono normal-case tracking-normal text-ink">
          {used} / {context.limit} tokens
        </span>
      </h2>
      <div className="relative mx-4 mt-2 flex h-2 shrink-0 overflow-hidden rounded-full bg-line">
        {context.blocks.map((block) => (
          <span
            key={block.id}
            title={`${KIND_LABELS[block.kind]} · ${block.tokens} tokens`}
            style={{ width: `${(block.tokens / context.limit) * PERCENT}%`, backgroundColor: BLOCK_COLORS[block.kind].left }}
          />
        ))}
        <span
          className="absolute inset-y-0 w-px bg-danger"
          style={{ left: `${COMPACT_AT_SHARE * PERCENT}%` }}
          title="Seuil de compaction"
        />
      </div>
      {context.blocks.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">
          Ce que le modèle relit à chaque requête. La fenêtre se remplit à l&apos;ouverture d&apos;une session.
        </p>
      ) : (
        <ol ref={listRef} className="mt-2 min-h-0 flex-1 overflow-y-auto px-4">
          {context.blocks.map((block) => (
            <li key={block.id} className="flex items-baseline gap-2 py-0.5 text-xs leading-snug">
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: BLOCK_COLORS[block.kind].right }}
              >
                {KIND_LABELS[block.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted" title={block.text}>
                {block.text}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted">{block.tokens}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="shrink-0 border-t border-line px-4 py-1.5 text-[11px] leading-snug text-muted">
        {context.requestCount === 0
          ? "Les statuts, les points d'entrée et tes accords n'y entrent pas : ils sont pour ton application."
          : `Requête modèle n° ${context.requestCount} : ${context.lastRequestTokens} tokens relus d'un coup. Fenêtre miniature, pour voir la compaction.`}
      </p>
    </section>
  );
}
