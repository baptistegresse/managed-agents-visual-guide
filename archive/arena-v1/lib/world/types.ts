export interface Canvas {
  readonly size: number;
  /** Une lettre de palette par cellule, ligne par ligne ; "." pour une cellule vide. */
  readonly colors: string;
  /** Numéro d'agent (slot) propriétaire de chaque cellule, ou NO_OWNER. */
  readonly owners: readonly number[];
}

export interface PaintCell {
  readonly x: number;
  readonly y: number;
  readonly code: string;
}

export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type AgentStatus =
  | "starting"
  | "thinking"
  | "resting"
  | "awaiting_approval"
  | "retired";

export type RetireReason =
  | "turns_exhausted"
  | "budget_reached"
  | "left"
  | "terminated"
  | "error";

export interface Tenant {
  readonly slot: number;
  /** Identifiant privé du visiteur (cookie). Ne quitte jamais le serveur. */
  readonly visitorId: string;
  readonly name: string;
  readonly mission: string;
  readonly accent: string;
  readonly status: AgentStatus;
  readonly retireReason: RetireReason | null;
  readonly turn: number;
  readonly lastChatSeq: number;
  readonly lastChangeSeq: number;
  readonly costCents: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface ChatMessage {
  readonly seq: number;
  readonly slot: number;
  readonly name: string;
  readonly text: string;
  readonly at: number;
}

export interface CanvasChange {
  readonly seq: number;
  readonly slot: number;
  readonly count: number;
  readonly box: BoundingBox;
}

export interface Conflict {
  readonly slot: number;
  readonly count: number;
}

export interface Approval {
  /** Identifiant de l'événement `agent.custom_tool_use` en attente. */
  readonly id: string;
  readonly slot: number;
  readonly tool: string;
  readonly cells: readonly PaintCell[];
  readonly conflicts: readonly Conflict[];
  readonly box: BoundingBox;
  readonly createdAt: number;
}

/** Où l'étape s'est exécutée : c'est ce que la démo cherche à rendre visible. */
export type ActivitySource = "model" | "server" | "moderator" | "session";

export interface Activity {
  readonly seq: number;
  readonly slot: number | null;
  readonly source: ActivitySource;
  readonly text: string;
  readonly at: number;
}

export interface World {
  readonly canvas: Canvas;
  readonly tenants: readonly Tenant[];
  readonly chat: readonly ChatMessage[];
  readonly changes: readonly CanvasChange[];
  readonly approvals: readonly Approval[];
  readonly activity: readonly Activity[];
  readonly nextSeq: number;
  readonly isPaused: boolean;
}

export interface PublicAgent {
  readonly slot: number;
  readonly name: string;
  readonly mission: string;
  readonly accent: string;
  readonly status: AgentStatus;
  readonly retireReason: RetireReason | null;
  readonly turn: number;
  readonly costCents: number | null;
  readonly pixelCount: number;
}

export interface PublicApproval {
  readonly id: string;
  readonly slot: number;
  readonly summary: string;
  readonly box: BoundingBox;
  readonly createdAt: number;
}

/** Ce que reçoit chaque navigateur : aucun identifiant de visiteur ni de session. */
export interface PublicWorld {
  readonly size: number;
  readonly colors: string;
  readonly owners: readonly number[];
  readonly agents: readonly PublicAgent[];
  readonly chat: readonly ChatMessage[];
  readonly activity: readonly Activity[];
  readonly approvals: readonly PublicApproval[];
  readonly isPaused: boolean;
  readonly mySlot: number | null;
}
