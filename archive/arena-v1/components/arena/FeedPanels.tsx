"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Activity, ChatMessage, PublicAgent } from "@/lib/world/types";
import { formatTime, SOURCE_STYLES } from "./labels";

interface FeedProps {
  title: string;
  subtitle: string;
  itemCount: number;
  emptyText: string;
  children: ReactNode;
}

/** Panneau défilant qui reste collé en bas quand de nouvelles lignes arrivent. */
function Feed({ title, subtitle, itemCount, emptyText, children }: FeedProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [itemCount]);

  return (
    <section className="flex max-h-80 flex-col rounded-lg border border-line bg-panel lg:max-h-none lg:min-h-0 lg:flex-1">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      </header>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {itemCount === 0 ? <p className="py-2 text-sm text-muted">{emptyText}</p> : children}
      </div>
    </section>
  );
}

interface ChatPanelProps {
  messages: readonly ChatMessage[];
  agents: readonly PublicAgent[];
}

export function ChatPanel({ messages, agents }: ChatPanelProps) {
  const accentOf = (slot: number): string => agents.find((agent) => agent.slot === slot)?.accent ?? "#8a90a2";
  return (
    <Feed
      title="Chat public"
      subtitle="Les agents se parlent entre eux, via leur outil post_chat_message."
      itemCount={messages.length}
      emptyText="Aucun message pour l'instant."
    >
      <ul className="flex flex-col gap-2">
        {messages.map((message) => (
          <li key={message.seq} className="text-sm leading-snug">
            <span className="font-semibold" style={{ color: accentOf(message.slot) }}>
              {message.name}
            </span>
            <span className="ml-2 font-mono text-[10px] text-muted">{formatTime(message.at)}</span>
            <p className="break-words text-text">{message.text}</p>
          </li>
        ))}
      </ul>
    </Feed>
  );
}

interface ActivityPanelProps {
  activity: readonly Activity[];
}

export function ActivityPanel({ activity }: ActivityPanelProps) {
  return (
    <Feed
      title="Coulisses"
      subtitle="Chaque étape, avec l'endroit où elle s'exécute."
      itemCount={activity.length}
      emptyText="Rien ne s'est encore passé."
    >
      <ul className="flex flex-col gap-1.5">
        {activity.map((entry) => {
          const source = SOURCE_STYLES[entry.source];
          return (
            <li key={entry.seq} className="flex items-start gap-2 text-xs leading-snug">
              <span
                className="mt-px shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]"
                style={{ color: source.color, background: `${source.color}22` }}
                title={source.hint}
              >
                {source.label}
              </span>
              <span className="break-words text-text/90">{entry.text}</span>
            </li>
          );
        })}
      </ul>
    </Feed>
  );
}
