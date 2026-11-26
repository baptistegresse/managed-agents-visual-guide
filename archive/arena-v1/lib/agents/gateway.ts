export type IdleReason = "end_turn" | "requires_action" | "budget_reached" | "other";

/**
 * Les événements de session dont le moteur a besoin, traduits depuis le flux
 * Managed Agents. Tout le reste du flux est ignoré par l'adaptateur.
 */
export type AgentEvent =
  | { readonly type: "running" }
  | { readonly type: "tool_call"; readonly id: string; readonly name: string; readonly input: unknown }
  | { readonly type: "message"; readonly text: string }
  | { readonly type: "model_usage"; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly type: "idle"; readonly reason: IdleReason }
  | { readonly type: "terminated" }
  | { readonly type: "error"; readonly message: string };

/** Port vers Managed Agents : une session par agent autonome. */
export interface SessionGateway {
  createSession(title: string): Promise<string>;
  events(sessionId: string, signal: AbortSignal): AsyncIterable<AgentEvent>;
  sendMessage(sessionId: string, text: string): Promise<void>;
  sendToolResult(sessionId: string, toolUseId: string, text: string, isError: boolean): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  getCostCents(sessionId: string): Promise<number | null>;
}
