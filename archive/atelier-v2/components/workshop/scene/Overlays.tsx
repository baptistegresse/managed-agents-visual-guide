import type { CSSProperties, ReactNode } from "react";
import { project } from "@/lib/iso/projection";
import { hopAnchors } from "@/lib/workshop/anchors";
import type { Frame } from "@/lib/workshop/camera";
import { usedTokens } from "@/lib/workshop/context";
import {
  CONTEXT_STACK,
  CRON_CLOCK,
  LIBRARY,
  NIGHTSTAND,
  SCENE_VIEW,
  VAULT,
  WALL_HEIGHT,
  WORKBENCH,
} from "@/lib/workshop/layout";
import type { PartId } from "@/lib/workshop/parts";
import type { RunState } from "@/lib/workshop/run";
import type { WorkshopState } from "@/lib/workshop/state";
import { STACK_FULL_HEIGHT } from "./ContextStack";
import { HOP_COLORS } from "./HopLine";
import type { Phase } from "./iso";
import type { ScenePhases } from "./Scene";

export const VIEW = SCENE_VIEW;

interface PinProps {
  /** Position en pixels de la scène. */
  left: number;
  top: number;
  moveMs?: number;
  /** L'étiquette reçoit les clics ; par défaut elle les laisse passer à la scène. */
  isInteractive?: boolean;
  children: ReactNode;
}

/** Une étiquette HTML posée à un point de la scène, pour un texte net à toute taille. */
function Pin({ left, top, moveMs = 0, isInteractive = false, children }: PinProps) {
  const style: CSSProperties = {
    left: `${((left - VIEW.x) / VIEW.width) * 100}%`,
    top: `${((top - VIEW.y) / VIEW.height) * 100}%`,
    transition: `left ${moveMs}ms linear, top ${moveMs}ms linear`,
  };
  return (
    <div
      className={`${isInteractive ? "" : "pointer-events-none "}absolute -translate-x-1/2 -translate-y-full`}
      style={style}
    >
      {children}
    </div>
  );
}

interface TagProps extends Omit<PinProps, "left" | "top"> {
  x: number;
  y: number;
  z: number;
  /** Décalage vertical en pixels de la scène (négatif = plus haut). */
  lift?: number;
}

/** Une étiquette ancrée à un point de la pièce, donné en cases. */
function Tag({ x, y, z, lift = 0, ...pin }: TagProps) {
  const point = project(x, y, z);
  return <Pin left={point.x} top={point.y + lift} {...pin} />;
}

const PILL =
  "whitespace-nowrap rounded-full border border-line bg-panel/95 px-2.5 py-0.5 text-[11px] font-medium text-ink shadow-sm";
const ZONE =
  "whitespace-nowrap rounded-lg border border-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide shadow-sm backdrop-blur-sm";
const BADGE = "scene-bubble inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold shadow-md";
const AMBER = `${BADGE} bg-[#e8b93b] text-night`;
const STATUS_HEIGHT = 2.5;
const HOP_LABEL_LIFT = -8;

interface OverlaysProps {
  workshop: WorkshopState;
  run: RunState;
  phases: ScenePhases;
  isAsleep: boolean;
  /** Remplace le nom de l'agent sous lui, tant qu'il n'a pas encore été créé. */
  agentLabel?: string;
  /** On a cliqué sur le nom de la session. */
  onFocus: (part: PartId) => void;
  /** La partie que l'introduction demande de cliquer, s'il y en a une. */
  target?: PartId | null;
  /** Ce que la caméra montre : les appels sortent par ses bords. */
  frame: Frame;
}

/** Une pièce encore à l'état de plan n'a pas d'étiquette : on ne nomme que ce qui est là. */
function isVisible(phase: Phase): boolean {
  return phase === "built" || phase === "preview";
}

/** Tout le texte posé sur la pièce : son nom, celui de ses objets, et l'appel en train de voyager. */
export function Overlays({ workshop, run, phases, isAsleep, agentLabel, onFocus, target = null, frame }: OverlaysProps) {
  const { actor, hop } = run;
  const shownVersion = workshop.session.agentVersion ?? workshop.agent.version;
  const anchors = hop ? hopAnchors(hop, actor.position, frame) : null;

  return (
    <>
      {phases.room !== "hidden" && <SessionLabel workshop={workshop} onFocus={onFocus} isTarget={target === "session"} />}
      {isVisible(phases.vault) && (
        <Tag x={VAULT.x + VAULT.size / 2} y={VAULT.y + VAULT.size / 2} z={VAULT.height} lift={-18}>
          <span className={PILL}>
            Vault · {workshop.vault.keys.length} clé{workshop.vault.keys.length > 1 ? "s" : ""}
          </span>
        </Tag>
      )}
      {isVisible(phases.context) && (
        <Tag
          x={CONTEXT_STACK.x + CONTEXT_STACK.size / 2}
          y={CONTEXT_STACK.y + CONTEXT_STACK.size / 2}
          z={STACK_FULL_HEIGHT + 0.25}
          lift={-4}
        >
          <span className={`${PILL} font-mono`}>
            Contexte {usedTokens(run.context)} / {run.context.limit}
            {run.context.compactionCount > 0 ? ` · compacté ×${run.context.compactionCount}` : ""}
          </span>
        </Tag>
      )}
      {isVisible(phases.bench) && (
        <Tag x={WORKBENCH.x + WORKBENCH.width / 2} y={WORKBENCH.y} z={WALL_HEIGHT} lift={-28}>
          <span className={PILL}>
            Conteneur
            {workshop.session.hasPlan ? " · FAQ montée" : ""}
            {run.files.length > 0 ? ` · ${run.files.join(", ")}` : ""}
          </span>
        </Tag>
      )}
      {isVisible(phases.memory) && (
        <Tag x={NIGHTSTAND.x + NIGHTSTAND.size / 2} y={NIGHTSTAND.y + NIGHTSTAND.size / 2} z={NIGHTSTAND.height} lift={-16}>
          <span className={PILL}>
            Mémoire · {run.memory.length} note{run.memory.length > 1 ? "s" : ""}
          </span>
        </Tag>
      )}
      {isVisible(phases.library) && (
        <Tag x={LIBRARY.x + LIBRARY.width / 2} y={LIBRARY.y} z={LIBRARY.height} lift={-6}>
          <span className={PILL}>Skills{run.activeSpot === "library" ? " · chargement" : ""}</span>
        </Tag>
      )}
      {isVisible(phases.entries) && run.activeEntry !== "cron" && (
        <Tag x={CRON_CLOCK.x} y={CRON_CLOCK.y} z={0} lift={22}>
          <span className={PILL}>Horloge du déploiement</span>
        </Tag>
      )}
      {run.terminal && (
        <Tag x={WORKBENCH.x + WORKBENCH.width / 2} y={WORKBENCH.y} z={WORKBENCH.height + 0.9}>
          <pre className="scene-bubble max-w-64 whitespace-pre-wrap rounded-lg bg-night px-3 py-2 text-left font-mono text-[10.5px] leading-snug text-[#9be7b4] shadow-lg">
            {run.terminal.join("\n")}
          </pre>
        </Tag>
      )}
      {hop && anchors && (
        <Pin left={(anchors.from.x + anchors.to.x) / 2} top={(anchors.from.y + anchors.to.y) / 2 + HOP_LABEL_LIFT}>
          <span className={`${BADGE} font-mono text-white`} style={{ backgroundColor: HOP_COLORS[hop.tone] }}>
            {hop.label}
          </span>
        </Pin>
      )}
      {run.verdict && (
        <Tag x={actor.position.x} y={actor.position.y} z={STATUS_HEIGHT} moveMs={actor.moveMs}>
          <span
            className={
              run.verdict.tone === "ok"
                ? `${BADGE} bg-ok text-white`
                : run.verdict.tone === "danger"
                  ? `${BADGE} bg-danger text-white`
                  : AMBER
            }
          >
            {run.verdict.text}
          </span>
        </Tag>
      )}
      {run.status === "terminated" && (
        <Tag x={actor.position.x} y={actor.position.y} z={STATUS_HEIGHT}>
          <span className={`${BADGE} bg-danger text-white`}>Session terminée</span>
        </Tag>
      )}
      {run.status === "rescheduling" && (
        <Tag x={actor.position.x} y={actor.position.y} z={STATUS_HEIGHT}>
          <span className={AMBER}>Panne : nouvel essai…</span>
        </Tag>
      )}
      {run.approval && (
        <Tag x={actor.position.x} y={actor.position.y} z={STATUS_HEIGHT} moveMs={actor.moveMs}>
          <span className={AMBER}>Attend ton accord</span>
        </Tag>
      )}
      {run.activeEntry === "cron" && (
        <Tag x={CRON_CLOCK.x} y={CRON_CLOCK.y} z={1.7}>
          <span className={AMBER}>Déploiement planifié</span>
        </Tag>
      )}
      {phases.agent !== "hidden" && isVisible(phases.agent) && run.status === "idle" && (
        <Tag x={actor.position.x + 1.7} y={actor.position.y + 0.5} z={0} lift={24} moveMs={actor.moveMs}>
          <span className={`${PILL} border-coral/40 text-coral-dark`}>
            {agentLabel ?? (workshop.agent.name || "Agent")}
            {!agentLabel && shownVersion > 0 ? ` v${shownVersion}` : ""}
            {isAsleep ? " · idle" : ""}
          </span>
        </Tag>
      )}
      {actor.bubble && (
        <Tag x={actor.position.x} y={actor.position.y} z={STATUS_HEIGHT} moveMs={actor.moveMs}>
          <p className="scene-bubble w-max max-w-56 rounded-2xl rounded-bl-sm border border-line bg-white px-3 py-1.5 text-xs leading-snug text-ink shadow-md">
            {actor.bubble}
          </p>
        </Tag>
      )}
    </>
  );
}

interface SessionLabelProps {
  workshop: WorkshopState;
  onFocus: (part: PartId) => void;
  /** L'introduction demande de cliquer dessus. */
  isTarget: boolean;
}

/** Le nom de la pièce : un clic dessus affiche ce qu'est une session. */
function SessionLabel({ workshop, onFocus, isTarget }: SessionLabelProps) {
  const environment =
    workshop.environment.id === null
      ? ""
      : ` · environnement « ${workshop.environment.name || "sans nom"} », ${
          workshop.environment.networking === "limited" ? "réseau isolé" : "réseau ouvert"
        }`;
  return (
    <Tag x={0} y={0} z={WALL_HEIGHT} lift={-8} isInteractive>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onFocus("session");
        }}
        className={`${ZONE} relative flex cursor-pointer flex-col items-center gap-0.5 bg-coral/15 text-coral-dark transition hover:brightness-95 ${
          isTarget ? "ring-2 ring-coral ring-offset-2" : ""
        }`}
      >
        {isTarget && (
          <span className="scene-alert absolute -top-2.5 right-2 rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-white shadow">
            clique ici
          </span>
        )}
        <span>Session · chez Anthropic</span>
        <span className="text-[11px] font-medium normal-case tracking-normal opacity-90">
          L&apos;agent décide quoi faire{environment}
        </span>
      </button>
    </Tag>
  );
}

interface RunProps {
  run: RunState;
}

/** Le plafond de dépense de la session : il reste en place quand on zoome. */
export function BudgetGauge({ run }: RunProps) {
  if (run.budgetCents === null) return null;
  return (
    <div className="absolute left-3 top-3 w-36 rounded-lg border border-line bg-panel/95 px-2.5 py-2 shadow-sm">
      <p className="flex justify-between text-[11px] font-medium text-ink">
        <span>Budget</span>
        <span className="font-mono">
          {run.spentCents} / {run.budgetCents} ¢
        </span>
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all ${run.status === "paused_budget" ? "bg-danger" : "bg-coral"}`}
          style={{ width: `${Math.min(100, (run.spentCents / run.budgetCents) * 100)}%` }}
        />
      </div>
      {run.status === "paused_budget" && <p className="mt-1 text-[10px] font-medium text-danger">En pause</p>}
    </div>
  );
}

/** Le verdict du correcteur, critère par critère. */
export function GraderCard({ run }: RunProps) {
  if (!run.outcome) return null;
  return (
    <div className="absolute right-3 top-3 w-52 rounded-lg border border-[#a67bd6]/50 bg-panel/95 px-3 py-2 shadow-sm">
      <p className="text-[11px] font-semibold text-[#6a45a0]">
        Correcteur · essai {run.outcome.iteration + 1}/{run.outcome.maxIterations}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {run.outcome.criteria.map((criterion) => (
          <li key={criterion.text} className="flex items-start gap-1.5 text-[11px] leading-snug text-ink">
            <span className={criterion.isMet ? "text-ok" : "text-danger"}>{criterion.isMet ? "✓" : "✗"}</span>
            {criterion.text}
          </li>
        ))}
      </ul>
      <p className="mt-1 font-mono text-[10px] text-muted">{run.outcome.phase}</p>
    </div>
  );
}
