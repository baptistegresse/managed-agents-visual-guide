import type { PublicWorld } from "@/lib/world/types";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ArenaSettings {
  readonly mode: "live" | "simulation" | "unconfigured";
  readonly maxActiveAgents: number;
  readonly maxTurns: number;
  readonly budgetCents: number;
  readonly model: string;
}

/** Ce que le flux `/api/world/stream` envoie à chaque navigateur. */
export interface ArenaView {
  readonly world: PublicWorld;
  readonly settings: ArenaSettings;
}
