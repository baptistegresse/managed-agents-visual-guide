import type { GridPoint } from "@/lib/iso/projection";
import type { KeyId, ToolId } from "./catalog";
import type { Desk } from "./desk";

export type Mood = "idle" | "thinking" | "walking" | "working" | "waiting" | "stunned" | "off";
export type EventOrigin = "agent" | "app" | "session" | "entry" | "sandbox" | "grader" | "mcp" | "web";

/** Un endroit de la session qui s'anime pendant un appel : la bibliothèque de skills. */
export type Spot = "library";

/** Les endroits entre lesquels voyagent les appels : la session, ton application, et le monde extérieur. */
export type Place = "agent" | "app" | "orders" | "webhook" | "cron" | "desk" | "vault" | "web" | `service:${KeyId}`;

/** Un appel en train de traverser d'une zone à l'autre, avec le nom de ce qu'il transporte. */
export interface Hop {
  readonly from: Place;
  readonly to: Place;
  readonly label: string;
  readonly tone: "entry" | "call" | "result" | "error" | "effect";
}

/** Par où un tour démarre : un appel de ton application, un webhook, ou une échéance planifiée. */
export type EntryPoint = "api" | "webhook" | "cron";

/**
 * Politique des outils intégrés : absents, toujours autorisés, soumis à ton
 * accord, ou évalués un par un par la plateforme (« auto »).
 */
export type SandboxPolicy = "off" | "always_allow" | "always_ask" | "auto";

export type SessionStatus = "idle" | "running" | "waiting_approval" | "paused_budget" | "rescheduling" | "terminated";

/** Ce que la plateforme a décidé d'un appel sous la politique « auto ». */
export interface Verdict {
  readonly text: string;
  readonly tone: "ok" | "ask" | "danger";
}

/** Un appel d'outil qui attend l'accord d'un humain : un outil du bac à sable, ou celui d'un service tiers. */
export interface ApprovalRequest {
  readonly tool: string;
  readonly target: string;
}

/** Une copie de l'agent à qui il a délégué une partie du travail. */
export interface HelperView {
  readonly id: number;
  readonly position: GridPoint;
  readonly moveMs: number;
  readonly carrying: ToolId | null;
}

export type OutcomeResult = "satisfied" | "needs_revision" | "max_iterations_reached";

export interface Criterion {
  readonly text: string;
  readonly isMet: boolean;
}

/** Où en est l'objectif fixé à la session, vu par le correcteur. */
export interface OutcomeView {
  readonly description: string;
  readonly criteria: readonly Criterion[];
  readonly iteration: number;
  readonly maxIterations: number;
  readonly phase: "working" | "grading" | OutcomeResult;
}

/** Un changement à l'écran. Les « event » portent le nom du vrai événement Managed Agents. */
export type Effect =
  | {
      readonly type: "event";
      readonly name: string;
      readonly detail: string;
      readonly origin: EventOrigin;
      readonly isError?: boolean;
    }
  /** Sans `who`, c'est l'agent qui bouge ; "worker" désigne le code de ton application. */
  | { readonly type: "move"; readonly to: GridPoint; readonly durationMs: number; readonly who?: "worker" }
  | { readonly type: "mood"; readonly mood: Mood }
  | { readonly type: "carry"; readonly tool: ToolId | null; readonly who?: "worker" }
  | { readonly type: "hop"; readonly hop: Hop | null }
  /** Un déploiement planifié ouvre une nouvelle session : la fenêtre de contexte repart de zéro. */
  | { readonly type: "freshSession" }
  | { readonly type: "bubble"; readonly text: string | null }
  | { readonly type: "key"; readonly key: KeyId | null; readonly isDenied: boolean }
  | { readonly type: "desk"; readonly desk: Desk }
  | { readonly type: "status"; readonly status: SessionStatus }
  | { readonly type: "entry"; readonly point: EntryPoint | null }
  | { readonly type: "terminal"; readonly lines: readonly string[] | null }
  | { readonly type: "file"; readonly name: string }
  | { readonly type: "approval"; readonly request: ApprovalRequest | null }
  | { readonly type: "memory"; readonly notes: readonly string[] }
  | { readonly type: "memoryUse"; readonly isActive: boolean }
  | { readonly type: "helpers"; readonly helpers: readonly HelperView[] }
  | { readonly type: "outcome"; readonly outcome: OutcomeView | null }
  | { readonly type: "spot"; readonly spot: Spot | null }
  | { readonly type: "verdict"; readonly verdict: Verdict | null };

/** Un temps de l'animation : des effets appliqués ensemble, puis une attente. */
export interface Beat {
  readonly durationMs: number;
  readonly effects: readonly Effect[];
  /** Ce temps correspond à un appel au modèle : il compte dans le budget de la session. */
  readonly isModelRequest?: boolean;
}

/** Un point où la session s'arrête et attend ta décision avant de continuer. */
export interface Gate {
  readonly gate: "approval";
  readonly ask: Beat;
  readonly allow: readonly Step[];
  readonly deny: readonly Step[];
}

export type Step = Beat | Gate;

export interface Timeline {
  readonly beats: readonly Step[];
  readonly desk: Desk;
}

export function isGate(step: Step): step is Gate {
  return "gate" in step;
}

/** Déroule une animation en supposant la même réponse à chaque demande d'accord. */
export function flatten(steps: readonly Step[], decision: "allow" | "deny" = "allow"): Beat[] {
  return steps.flatMap((step) =>
    isGate(step) ? [step.ask, ...flatten(decision === "allow" ? step.allow : step.deny, decision)] : [step],
  );
}

/** Ce qui se passe réellement derrière chaque point d'entrée. */
export const ENTRY_EVENT_NAMES: Readonly<Record<EntryPoint, string>> = {
  api: "appel API → ta route",
  webhook: "webhook ← le support",
  cron: "cron ⏱ déploiement planifié",
};

export function event(name: string, detail: string, origin: EventOrigin, isError = false): Effect {
  return { type: "event", name, detail, origin, isError };
}

export const RESUMED: Effect = event("session.status_running", "l'agent reprend", "session");

const SPEECH_BASE_MS = 900;
const SPEECH_MS_PER_CHARACTER = 28;
const SPEECH_MAX_MS = 2600;

/** L'agent dit quelque chose : une bulle à l'écran, un `agent.message` dans le flux. */
export function speech(text: string): Beat {
  return {
    durationMs: Math.min(SPEECH_MAX_MS, SPEECH_BASE_MS + text.length * SPEECH_MS_PER_CHARACTER),
    effects: [{ type: "bubble", text }, event("agent.message", text, "agent")],
  };
}
