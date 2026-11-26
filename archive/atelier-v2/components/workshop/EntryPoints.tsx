"use client";

import { pickIncident, type Desk, type TicketKind } from "@/lib/workshop/desk";
import type { Trigger } from "@/lib/workshop/reaction";
import { TICKET_HEX } from "./scene/voxels";
import { CRON_INTERVAL_MS, WEBHOOK_MAX_DELAY_MS, WEBHOOK_MIN_DELAY_MS } from "./useAgentRun";

export interface EntryControls {
  desk: Desk;
  queuedCount: number;
  isWebhookOn: boolean;
  isCronOn: boolean;
  onTrigger: (trigger: Trigger) => void;
  /** Envoie une consigne par l'appel API, comme le champ de saisie. */
  onSendTask: (task: string) => void;
  onToggleWebhook: (isOn: boolean) => void;
  onToggleCron: (isOn: boolean) => void;
}

/** Les tickets qu'on peut faire arriver à la main ; la pastille reprend la couleur du ticket sur la scène. */
const TICKET_BUTTONS: ReadonlyArray<{ kind: TicketKind; label: string }> = [
  { kind: "question", label: "Un client pose une question" },
  { kind: "delivery", label: "Un colis n'est pas arrivé" },
  { kind: "refund", label: "Un client demande un remboursement" },
];
const API_TASK = "Traite les tickets en attente";
const FULL_DESK = "La boîte de support est pleine de tickets en attente.";

const CARD = "rounded-lg border border-line bg-white p-3";
const BADGE = "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold";
const SECONDS = 1_000;

interface SwitchProps {
  isOn: boolean;
  label: string;
  onChange: (isOn: boolean) => void;
}

function Switch({ isOn, label, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={label}
      onClick={() => onChange(!isOn)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${isOn ? "bg-ok" : "bg-line"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${isOn ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

/** Les trois points d'entrée : par où une demande arrive jusqu'à la session et réveille l'agent. */
export function EntryPoints({
  desk,
  queuedCount,
  isWebhookOn,
  isCronOn,
  onTrigger,
  onSendTask,
  onToggleWebhook,
  onToggleCron,
}: EntryControls) {
  // Un ticket ne peut arriver que s'il reste une place dans la boîte de support.
  const canArrive = (kind: TicketKind): boolean => pickIncident(desk, () => 0, kind) !== null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Points d&apos;entrée</h3>
      <p className="text-xs leading-relaxed text-muted">
        Trois façons de démarrer un tour. Sur la scène, regarde d&apos;où part le message à chaque fois.
      </p>

      <div className={CARD}>
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className={`${BADGE} bg-[#e2574c]/15 text-[#b03a31]`}>1</span> Appel API
        </p>
        <p className="mt-1 text-xs leading-snug text-muted">
          Quelqu&apos;un de ton équipe clique dans ton interface : ta route écrit dans la session. C&apos;est aussi ce
          que fait le champ de consigne plus haut.
        </p>
        <button
          type="button"
          onClick={() => onSendTask(API_TASK)}
          className="mt-2 rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-ink hover:border-coral"
        >
          {API_TASK}
        </button>
      </div>

      <div className={CARD}>
        <div className="flex items-center gap-2">
          <p className="flex flex-1 items-center gap-2 text-sm font-medium text-ink">
            <span className={`${BADGE} bg-[#4f9fd0]/15 text-[#2f729c]`}>2</span> Webhook
          </p>
          <Switch isOn={isWebhookOn} label="Tickets au hasard" onChange={onToggleWebhook} />
        </div>
        <p className="mt-1 text-xs leading-snug text-muted">
          Un client écrit : la boîte de support prévient ton serveur, et c&apos;est ton serveur qui écrit dans la
          session. Personne n&apos;a cliqué. Fais arriver un ticket, ou allume l&apos;interrupteur : un ticket au hasard
          toutes les {WEBHOOK_MIN_DELAY_MS / SECONDS} à {WEBHOOK_MAX_DELAY_MS / SECONDS} s.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TICKET_BUTTONS.map((button) => (
            <button
              key={button.kind}
              type="button"
              disabled={!canArrive(button.kind)}
              title={canArrive(button.kind) ? undefined : FULL_DESK}
              onClick={() => onTrigger({ entry: "webhook", kind: button.kind })}
              className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-ink hover:border-coral disabled:opacity-40"
            >
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: TICKET_HEX[button.kind] }} />
              {button.label}
            </button>
          ))}
        </div>
      </div>

      <div className={CARD}>
        <div className="flex items-center gap-2">
          <p className="flex flex-1 items-center gap-2 text-sm font-medium text-ink">
            <span className={`${BADGE} bg-[#e8b93b]/25 text-[#8a6a12]`}>3</span> Déploiement planifié (cron)
          </p>
          <Switch isOn={isCronOn} label="Relance programmée" onChange={onToggleCron} />
        </div>
        <p className="mt-1 text-xs leading-snug text-muted">
          L&apos;horloge est côté Anthropic : c&apos;est un déploiement planifié. À chaque échéance (ici toutes les{" "}
          {CRON_INTERVAL_MS / SECONDS} s, en vrai à la minute près), la plateforme ouvre elle-même une nouvelle session,
          contexte vierge, pour relancer les tickets restés sans réponse.
        </p>
      </div>

      {queuedCount > 0 && (
        <p className="text-xs text-coral-dark">
          {queuedCount} déclenchement{queuedCount > 1 ? "s" : ""} en file d&apos;attente : l&apos;agent est occupé.
        </p>
      )}
    </section>
  );
}
