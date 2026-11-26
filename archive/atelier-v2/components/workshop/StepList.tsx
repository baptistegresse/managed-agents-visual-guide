"use client";

import type { Dispatch } from "react";
import { isStepDone, STEPS, type StepId, type WorkshopAction, type WorkshopState } from "@/lib/workshop/state";
import { SessionPanel, type SessionControls } from "./SessionPanel";
import { AgentForm, EnvironmentForm, ToolsForm, VaultForm } from "./StepForms";

interface StepListProps {
  workshop: WorkshopState;
  dispatch: Dispatch<WorkshopAction>;
  step: StepId;
  session: SessionControls;
}

const TITLES: Readonly<Record<StepId, string>> = {
  environment: "L'environnement",
  vault: "Le vault",
  tools: "Les outils",
  agent: "L'agent",
  session: "La session",
};

/** Ce qu'on rappelle d'une étape une fois qu'elle est faite. */
function summaryOf(step: StepId, workshop: WorkshopState): string {
  switch (step) {
    case "environment":
      return workshop.environment.id ?? "";
    case "vault":
      return workshop.vault.id ?? "";
    case "tools":
      return `${workshop.tools.enabled.length} outil(s)`;
    case "agent":
      return workshop.agent.id ? `${workshop.agent.id} · v${workshop.agent.version}` : "";
    case "session":
      return workshop.session.id ? `${workshop.session.id} · agent v${workshop.session.agentVersion}` : "";
  }
}

/** Le parcours pas à pas : une seule étape ouverte à la fois, dans l'ordre. */
export function StepList({ workshop, dispatch, step, session }: StepListProps) {
  return (
    <ol className="flex flex-col gap-2">
      {STEPS.map((id, index) => {
        const isCurrent = id === step;
        const isDone = isStepDone(workshop, id);
        return (
          <li
            key={id}
            className={`rounded-xl border bg-panel ${isCurrent ? "border-coral/60 shadow-sm" : "border-line"} ${
              !isCurrent && !isDone ? "opacity-55" : ""
            }`}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isDone ? "bg-ok text-white" : isCurrent ? "bg-coral text-white" : "bg-line text-muted"
                }`}
              >
                {isDone ? "✓" : index + 1}
              </span>
              <h2 className="text-sm font-semibold text-ink">{TITLES[id]}</h2>
              {isDone && <span className="ml-auto truncate font-mono text-[11px] text-muted">{summaryOf(id, workshop)}</span>}
            </div>
            {isCurrent && (
              <div className="border-t border-line px-4 py-4">
                {id === "environment" && <EnvironmentForm workshop={workshop} dispatch={dispatch} />}
                {id === "vault" && <VaultForm workshop={workshop} dispatch={dispatch} />}
                {id === "tools" && <ToolsForm workshop={workshop} dispatch={dispatch} />}
                {id === "agent" && <AgentForm workshop={workshop} dispatch={dispatch} />}
                {id === "session" && <SessionPanel workshop={workshop} dispatch={dispatch} session={session} />}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
