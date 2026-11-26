"use client";

import { useState, type Dispatch, type FormEvent } from "react";
import { openTickets, ticketLabel } from "@/lib/workshop/desk";
import { goalDescription, DEFAULT_GOAL } from "@/lib/workshop/outcome";
import type { WorkshopAction, WorkshopState } from "@/lib/workshop/state";
import { AgentRevision } from "./AgentRevision";
import { EntryPoints } from "./EntryPoints";
import { useUnlocked } from "./guide";
import { HINT } from "./StepForms";
import { ChoiceCard, FIELD_CLASS, PrimaryButton, usePendingCreate } from "./ui";
import type { AgentRun } from "./useAgentRun";

export interface SessionControls {
  agentRun: AgentRun;
  /** Ferme la session : la boîte de support et la mémoire restent, et ses réglages redeviennent modifiables. */
  onNewSession: () => void;
}

interface SessionPanelProps {
  workshop: WorkshopState;
  dispatch: Dispatch<WorkshopAction>;
  session: SessionControls;
}

const BUDGET_CHOICES: ReadonlyArray<{ cents: number | null; label: string }> = [
  { cents: null, label: "Sans limite" },
  { cents: 10, label: "10 ¢" },
  { cents: 25, label: "25 ¢" },
];
const BUDGET_TOP_UP_CENTS = 10;
const COUNT_SUGGESTION = "Combien de tickets sont ouverts ?";
const ALL_SUGGESTION = "Traite les tickets en attente";
const REPORT_SUGGESTION = "Fais le bilan du support";
const REFUND_SUGGESTION = "Traite les remboursements";
const TONE_SUGGESTION = "Réponds aux tickets en tutoyant";
const PLAN_SUGGESTION = "Réponds en suivant la FAQ";
/** « le ticket d'Alice » devient « ticket d'Alice » dans une consigne. */
const LEADING_ARTICLE = /^le /;
const RISKY_SUGGESTIONS = ["Vide le dossier de travail", "Installe un paquet"];
const WEB_SUGGESTIONS = [
  "Cherche le statut du transporteur sur le web",
  "Lis la page blog-inconnu.example",
];
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted";
const CHIP = "rounded-full border px-2.5 py-1 text-xs disabled:opacity-45";
const ALERT = "rounded-lg border p-3";

/** Avant le démarrage : ce qu'on règle une fois pour toute la session. */
function SessionSetup({ workshop, dispatch, session }: SessionPanelProps) {
  const unlocked = useUnlocked();
  const { isBusy, create } = usePendingCreate();
  const { budgetCents, hasMemory, hasPlan } = workshop.session;
  const hasSandbox = workshop.tools.sandbox !== "off";
  return (
    <div className="flex flex-col gap-3">
      <p className={HINT}>
        {workshop.session.count === 0
          ? "Une session, c'est une exécution : ton agent, dans son environnement, avec le vault attaché. Ici, elle lui confie la boîte de support."
          : `La session précédente est fermée. La suivante repart d'un conteneur vide, avec la v${workshop.agent.version} de l'agent ; la boîte de support, elle, est restée.`}
      </p>
      {unlocked("budget") && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Budget</span>
          <div className="flex flex-wrap gap-1.5">
            {BUDGET_CHOICES.map((choice) => (
              <button
                key={choice.label}
                type="button"
                aria-pressed={budgetCents === choice.cents}
                onClick={() =>
                  dispatch({ type: "budgetChosen", cents: choice.cents })
                }
                className={`${CHIP} ${budgetCents === choice.cents ? "border-coral bg-coral/10 text-coral-dark" : "border-line bg-white text-ink"}`}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <p className="text-xs leading-snug text-muted">
            Un plafond de dépense : atteint, la session se met en pause au lieu
            de continuer. Ici chaque appel au modèle compte 1 ¢, un coût grossi
            pour la démo.
          </p>
        </div>
      )}
      {unlocked("memory") && (
        <ChoiceCard
          isSelected={hasMemory}
          onClick={() => dispatch({ type: "memoryToggled" })}
          title="Attacher un carnet de mémoire"
          description={
            hasSandbox
              ? "Ce que l'agent y note survit à la session : il le relit dans la suivante."
              : "Indisponible : la mémoire est un dossier du conteneur, il faut le bac à sable pour la lire."
          }
        />
      )}
      {unlocked("advanced") && (
        <ChoiceCard
          isSelected={hasPlan}
          onClick={() => dispatch({ type: "planToggled" })}
          title="Monter un fichier : faq.md"
          description={
            hasSandbox
              ? "Le fichier est déposé dans le conteneur au démarrage ; l'agent peut le lire."
              : "Indisponible : sans bac à sable, l'agent n'a pas de quoi lire un fichier."
          }
        />
      )}
      <PrimaryButton
        isBusy={isBusy}
        onClick={() =>
          create("sesn", (id) => {
            session.agentRun.startSession(budgetCents);
            dispatch({ type: "sessionStarted", id });
          })
        }
      >
        {workshop.session.count === 0 ? "Démarrer la session" : "Démarrer une nouvelle session"}
      </PrimaryButton>
    </div>
  );
}

/** Pendant la session : consignes, objectif, points d'entrée, et les moments où elle t'attend. */
export function SessionPanel({
  workshop,
  dispatch,
  session,
}: SessionPanelProps) {
  const unlocked = useUnlocked();
  const [task, setTask] = useState("");
  const { agentRun, onNewSession } = session;
  const { run } = agentRun;

  if (!workshop.session.id)
    return (
      <SessionSetup workshop={workshop} dispatch={dispatch} session={session} />
    );

  const isBusy = run.status !== "idle";
  // Les suggestions suivent ce que cette session sait faire.
  const config = workshop.session.config;
  // La première suggestion d'action vise le plus ancien ticket en attente, nommément.
  const [firstOpen] = openTickets(run.desk);
  const suggestions = [
    ...new Set([
      COUNT_SUGGESTION,
      ...(firstOpen ? [`Réponds au ${ticketLabel(firstOpen).replace(LEADING_ARTICLE, "")}`] : []),
      ALL_SUGGESTION,
      REPORT_SUGGESTION,
      ...(config?.enabledTools.includes("create_refund") || config?.hasSkill ? [REFUND_SUGGESTION] : []),
      ...(workshop.session.hasMemory ? [TONE_SUGGESTION] : []),
      ...(workshop.session.hasPlan ? [PLAN_SUGGESTION] : []),
      ...(config && config.sandbox !== "off" ? RISKY_SUGGESTIONS : []),
      ...(config?.hasWeb ? WEB_SUGGESTIONS : []),
    ]),
  ];
  const isOver = run.status === "terminated";
  const send = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || isBusy) return;
    agentRun.sendTask(trimmed);
    setTask("");
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    send(task);
  };

  return (
    <div className="flex flex-col gap-3">
      {run.approval && (
        <div className={`${ALERT} border-[#e8b93b] bg-[#e8b93b]/15`}>
          <p className="text-sm font-medium text-ink">
            L&apos;agent attend ton accord
          </p>
          <p className="mt-1 font-mono text-xs text-ink">
            {run.approval.tool} : {run.approval.target}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => agentRun.decideApproval("allow")}
              className="rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-white"
            >
              Autoriser
            </button>
            <button
              type="button"
              onClick={() => agentRun.decideApproval("deny")}
              className="rounded-lg border border-danger px-3 py-1.5 text-xs font-semibold text-danger"
            >
              Refuser
            </button>
          </div>
        </div>
      )}
      {run.status === "paused_budget" && (
        <div className={`${ALERT} border-danger/50 bg-danger/10`}>
          <p className="text-sm font-medium text-ink">
            Budget atteint : la session est en pause
          </p>
          <p className="mt-1 text-xs text-muted">
            Rien n&apos;est perdu. Relever le plafond la relance là où elle en
            était.
          </p>
          <button
            type="button"
            onClick={() => agentRun.raiseBudget(BUDGET_TOP_UP_CENTS)}
            className="mt-2 rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white"
          >
            Ajouter {BUDGET_TOP_UP_CENTS} ¢
          </button>
        </div>
      )}

      {isOver && (
        <div className={`${ALERT} border-danger/50 bg-danger/10`}>
          <p className="text-sm font-medium text-ink">
            La session est terminée
          </p>
          <p className="mt-1 text-xs text-muted">
            Une panne définitive l&apos;a arrêtée : elle ne reprendra pas.
            La boîte de support est intacte ; ouvre une nouvelle session pour continuer.
          </p>
          <button
            type="button"
            onClick={onNewSession}
            className="mt-2 rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white"
          >
            Nouvelle session
          </button>
        </div>
      )}
      {run.status === "rescheduling" && (
        <div className={`${ALERT} border-[#e8b93b] bg-[#e8b93b]/15`}>
          <p className="text-sm font-medium text-ink">
            Panne passagère : la plateforme réessaie
          </p>
          <p className="mt-1 text-xs text-muted">
            Rien à faire de ton côté, la session reprend toute seule.
          </p>
        </div>
      )}

      <p className={HINT}>
        Donne une consigne à {workshop.agent.name}, ou pose-lui une question :
        il répond alors sans toucher à la boîte de support.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className={FIELD_CLASS}
          value={task}
          maxLength={160}
          placeholder="Une consigne ou une question"
          aria-label="Consigne pour l'agent"
          onChange={(event) => setTask(event.target.value)}
        />
        <button
          type="submit"
          disabled={isBusy || task.trim().length === 0}
          className="shrink-0 rounded-lg bg-coral px-4 text-sm font-semibold text-white hover:bg-coral-dark disabled:opacity-45"
        >
          Envoyer
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={isBusy}
            onClick={() => send(suggestion)}
            className={`${CHIP} border-line bg-white text-ink hover:border-coral`}
          >
            {suggestion}
          </button>
        ))}
        {isBusy && !isOver && (
          <button
            type="button"
            onClick={agentRun.interrupt}
            className={`${CHIP} border-danger text-danger`}
          >
            Interrompre
          </button>
        )}
      </div>

      {unlocked("advanced") && (
        <div className="rounded-lg border border-line bg-white p-3">
          <p className="text-sm font-medium text-ink">Fixer un objectif</p>
          <p className="mt-1 text-xs leading-snug text-muted">
            {goalDescription(DEFAULT_GOAL)} Un correcteur note le résultat et
            renvoie l&apos;agent corriger.
          </p>
          <button
            type="button"
            disabled={isBusy}
            onClick={agentRun.defineOutcome}
            className={`${CHIP} mt-2 border-[#a67bd6] text-[#6a45a0] hover:bg-[#a67bd6]/10`}
          >
            Lancer avec cet objectif
          </button>
        </div>
      )}

      {unlocked("evolve") && (
        <AgentRevision
          workshop={workshop}
          dispatch={dispatch}
          onRevised={agentRun.logEvent}
        />
      )}

      {unlocked("entries") && (
        <EntryPoints
          desk={run.desk}
          queuedCount={agentRun.queuedCount}
          isWebhookOn={agentRun.isWebhookOn}
          isCronOn={agentRun.isCronOn}
          onTrigger={agentRun.trigger}
          onSendTask={send}
          onToggleWebhook={agentRun.setWebhookOn}
          onToggleCron={agentRun.setCronOn}
        />
      )}

      {unlocked("advanced") && (
        <div className="rounded-lg border border-line bg-white p-3">
          <p className="text-sm font-medium text-ink">Simuler une panne</p>
          <p className="mt-1 text-xs leading-snug text-muted">
            {agentRun.armedFault
              ? `Panne ${agentRun.armedFault === "transient" ? "passagère" : "définitive"} armée : elle frappera le prochain appel au modèle.`
              : "Elle frappera le prochain appel au modèle : lance une consigne juste après."}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={isOver}
              onClick={() => agentRun.armFault("transient")}
              className={`${CHIP} border-[#e8b93b] text-[#8a6a12]`}
            >
              Panne passagère
            </button>
            <button
              type="button"
              disabled={isOver}
              onClick={() => agentRun.armFault("fatal")}
              className={`${CHIP} border-danger text-danger`}
            >
              Panne définitive
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="font-mono text-[11px] text-muted">
          dépensé : {run.spentCents} ¢
          {run.budgetCents === null ? "" : ` sur ${run.budgetCents} ¢`}
        </p>
        <button
          type="button"
          onClick={onNewSession}
          className={`${CHIP} border-line bg-white text-ink hover:border-coral`}
        >
          Nouvelle session
        </button>
      </div>
    </div>
  );
}
