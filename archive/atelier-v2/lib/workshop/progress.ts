import type { GridPoint } from "@/lib/iso/projection";
import type { ToolId } from "./catalog";
import type { Desk } from "./desk";
import type { Step } from "./effects";

/** Où en est l'agent au fil du plan. */
export interface Progress {
  readonly desk: Desk;
  readonly at: GridPoint;
  /** Où se trouve le code de ton application, qui exécute les outils custom. */
  readonly workerAt: GridPoint;
  /** Outils refusés faute de clé pendant ce tour : l'agent ne les retente pas. */
  readonly deniedTools: readonly ToolId[];
  readonly memory: readonly string[];
  /** Tu as refusé un appel au bac à sable : il n'en tente plus d'autre ce tour-ci. */
  readonly isSandboxRefused: boolean;
}

/** La suite de l'animation, une fois connu l'état où l'étape en cours laisse l'agent. */
export type Continue = (progress: Progress) => Step[];
