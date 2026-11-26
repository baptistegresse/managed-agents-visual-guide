"use client";

import { useState, type Dispatch } from "react";
import { KEY_CATALOG, TOOL_CATALOG, type ToolId } from "@/lib/workshop/catalog";
import type { SandboxPolicy } from "@/lib/workshop/effects";
import { agentConfig, type AgentConfig, type WorkshopAction, type WorkshopState } from "@/lib/workshop/state";
import { useUnlocked } from "./guide";

interface AgentRevisionProps {
  workshop: WorkshopState;
  dispatch: Dispatch<WorkshopAction>;
  onRevised: (name: string, detail: string) => void;
}

const CHIP = "rounded-full border px-2.5 py-1 text-xs disabled:opacity-45";
const ON = "border-coral bg-coral/10 text-coral-dark";
const OFF = "border-line bg-white text-ink";

const SANDBOX_LABELS: ReadonlyArray<readonly [SandboxPolicy, string]> = [
  ["off", "Pas de bac à sable"],
  ["always_allow", "Bac à sable libre"],
  ["always_ask", "Bac à sable avec mon accord"],
  ["auto", "Bac à sable, la plateforme juge"],
];

function toggled(tools: readonly ToolId[], tool: ToolId): ToolId[] {
  return tools.includes(tool) ? tools.filter((each) => each !== tool) : [...tools, tool];
}

/**
 * Faire évoluer l'agent pendant qu'une session tourne : chaque enregistrement
 * crée une version, et la session en cours garde celle sur laquelle elle a démarré.
 */
export function AgentRevision({ workshop, dispatch, onRevised }: AgentRevisionProps) {
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const unlocked = useUnlocked();
  const { version } = workshop.agent;
  const sessionVersion = workshop.session.agentVersion ?? version;
  const hasSandbox = (draft ?? agentConfig(workshop)).sandbox !== "off";

  const save = (config: AgentConfig): void => {
    dispatch({ type: "agentRevised", config });
    onRevised("agents.update", `version ${version + 1} enregistrée ; cette session reste sur la v${sessionVersion}`);
    setDraft(null);
  };

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="text-sm font-medium text-ink">Faire évoluer l&apos;agent</p>
      <p className="mt-1 text-xs leading-snug text-muted">
        {version > sessionVersion
          ? `Cette session tourne sur la v${sessionVersion}. La v${version} servira à la prochaine session.`
          : `L'agent est en v${version}. Le modifier crée une nouvelle version, sans toucher à cette session.`}
      </p>
      {draft === null ? (
        <button type="button" onClick={() => setDraft(agentConfig(workshop))} className={`${CHIP} ${OFF} mt-2 hover:border-coral`}>
          Modifier ses outils
        </button>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {TOOL_CATALOG.map((tool) => (
              <button
                key={tool.id}
                type="button"
                aria-pressed={draft.enabledTools.includes(tool.id)}
                onClick={() => setDraft({ ...draft, enabledTools: toggled(draft.enabledTools, tool.id) })}
                className={`${CHIP} ${draft.enabledTools.includes(tool.id) ? ON : OFF}`}
              >
                {tool.label}
              </button>
            ))}
          </div>
          {unlocked("sandbox") && (
            <select
              aria-label="Bac à sable"
              value={draft.sandbox}
              onChange={(event) => {
                const sandbox = event.target.value as SandboxPolicy;
                // Sans bac à sable, ce qui en dépend disparaît avec lui.
                setDraft({
                  ...draft,
                  sandbox,
                  hasSkill: sandbox !== "off" && draft.hasSkill,
                  hasWeb: sandbox !== "off" && draft.hasWeb,
                });
              }}
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink"
            >
              {SANDBOX_LABELS.filter(([policy]) => policy !== "auto" || unlocked("advanced")).map(([policy, label]) => (
                <option key={policy} value={policy}>
                  {label}
                </option>
              ))}
            </select>
          )}
          {unlocked("advanced") && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={draft.canDelegate}
              onClick={() => setDraft({ ...draft, canDelegate: !draft.canDelegate })}
              className={`${CHIP} ${draft.canDelegate ? ON : OFF}`}
            >
              Peut déléguer
            </button>
            <button
              type="button"
              aria-pressed={draft.hasSkill}
              disabled={!hasSandbox}
              onClick={() => setDraft({ ...draft, hasSkill: !draft.hasSkill })}
              className={`${CHIP} ${draft.hasSkill ? ON : OFF}`}
            >
              Skill remboursement
            </button>
            <button
              type="button"
              aria-pressed={draft.hasWeb}
              disabled={!hasSandbox}
              onClick={() => setDraft({ ...draft, hasWeb: !draft.hasWeb })}
              className={`${CHIP} ${draft.hasWeb ? ON : OFF}`}
            >
              Web
            </button>
          </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={draft.enabledTools.length === 0}
              onClick={() => save(draft)}
              className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-45"
            >
              Enregistrer la v{version + 1}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-xs text-muted underline">
              Annuler
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 border-t border-line pt-2">
        <p className="text-xs leading-snug text-muted">
          Le vault, lui, se complète à tout moment, sans nouvelle version : il est consulté au moment de l&apos;appel.
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {KEY_CATALOG.map((key) => (
            <button
              key={key.id}
              type="button"
              aria-pressed={workshop.vault.keys.includes(key.id)}
              onClick={() => dispatch({ type: "keyToggled", key: key.id })}
              className={`${CHIP} ${workshop.vault.keys.includes(key.id) ? ON : OFF}`}
            >
              {key.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
