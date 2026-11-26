export const AGENT_MODEL = "claude-haiku-5-5";

/** Le ton d'une réponse au client : vouvoiement par défaut, tutoiement si on le demande. */
export const REPLY_TONES = ["vous", "tu"] as const;
export type ReplyTone = (typeof REPLY_TONES)[number];

export type KeyId = "paiements" | "transporteur";

export interface KeySpec {
  readonly id: KeyId;
  readonly label: string;
  /** Le service tiers que cette clé ouvre : il est branché à l'agent par un serveur MCP. */
  readonly service: string;
  readonly secretName: string;
  readonly host: string;
  readonly purpose: string;
}

/**
 * Les identifiants qu'on peut ranger dans le vault. Chacun ouvre un service tiers
 * que l'agent appelle directement, sans passer par ton application : c'est la
 * plateforme qui joint l'identifiant à l'appel, l'agent ne le voit jamais.
 */
export const KEY_CATALOG: readonly KeySpec[] = [
  {
    id: "paiements",
    label: "Clé Paiements",
    secretName: "PAIEMENTS_API_KEY",
    service: "Paiements",
    host: "paiements.example",
    purpose: "rembourser un client auprès du prestataire de paiement",
  },
  {
    id: "transporteur",
    label: "Clé Transporteur",
    secretName: "TRANSPORTEUR_API_KEY",
    service: "Transporteur",
    host: "transporteur.example",
    purpose: "suivre un colis auprès du transporteur",
  },
];

export type ToolId =
  | "reply_ticket"
  | "lookup_order"
  | "close_ticket"
  | "escalate_ticket"
  | "track_parcel"
  | "create_refund";

export interface ToolSpec {
  readonly id: ToolId;
  readonly label: string;
  readonly description: string;
  /**
   * `null` : un outil custom, exécuté par ton application. Sinon, l'outil appartient
   * au service tiers que cette clé ouvre, et c'est ce service qui l'exécute.
   */
  readonly requiresKey: KeyId | null;
  /** Chaque appel attend-il ton accord avant de partir ? (politique « always_ask ») */
  readonly needsApproval: boolean;
  /**
   * Où l'outil agit : sur la boîte de support, où écrivent les clients, ou sur
   * la base de commandes, que seul ton code peut lire.
   */
  readonly target: "desk" | "orders";
  readonly isEnabledByDefault: boolean;
}

/** L'ordre du catalogue est aussi celui des emplacements sur l'étagère, pour les outils custom. */
export const TOOL_CATALOG: readonly ToolSpec[] = [
  {
    id: "reply_ticket",
    label: "Réponse",
    description: "Envoie une réponse au client et marque son ticket comme résolu.",
    requiresKey: null,
    needsApproval: false,
    target: "desk",
    isEnabledByDefault: true,
  },
  {
    id: "lookup_order",
    label: "Commande",
    description: "Retrouve la commande du client dans la base de ton application.",
    requiresKey: null,
    needsApproval: false,
    target: "orders",
    isEnabledByDefault: true,
  },
  {
    id: "close_ticket",
    label: "Clôture",
    description: "Ferme un ticket indésirable sans y répondre.",
    requiresKey: null,
    needsApproval: false,
    target: "desk",
    isEnabledByDefault: true,
  },
  {
    id: "escalate_ticket",
    label: "Escalade",
    description: "Transmet le ticket à un humain de l'équipe.",
    requiresKey: null,
    needsApproval: false,
    target: "desk",
    isEnabledByDefault: true,
  },
  {
    id: "track_parcel",
    label: "Suivi colis",
    description: "Demande au transporteur où se trouve le colis. Outil du service Transporteur.",
    requiresKey: "transporteur",
    needsApproval: false,
    target: "desk",
    isEnabledByDefault: false,
  },
  {
    id: "create_refund",
    label: "Remboursement",
    description: "Rembourse la commande du client. Outil du service Paiements : chaque appel attend ton accord.",
    requiresKey: "paiements",
    needsApproval: true,
    target: "desk",
    isEnabledByDefault: false,
  },
];

export function toolSpec(id: ToolId): ToolSpec {
  const spec = TOOL_CATALOG.find((tool) => tool.id === id);
  if (!spec) throw new Error(`Outil inconnu : ${id}`);
  return spec;
}

export function keySpec(id: KeyId): KeySpec {
  const spec = KEY_CATALOG.find((key) => key.id === id);
  if (!spec) throw new Error(`Clé inconnue : ${id}`);
  return spec;
}

/** L'adresse du serveur MCP du service qu'ouvre une clé. */
export function mcpUrl(key: KeyId): string {
  return `https://${keySpec(key).host}/mcp`;
}

/** Les outils custom : ceux que ton application exécute, rangés sur son étagère. */
export const APP_TOOLS: readonly ToolSpec[] = TOOL_CATALOG.filter((tool) => tool.requiresKey === null);

/** Emplacement d'un outil custom sur l'étagère de ton application. */
export function rackIndex(id: ToolId): number {
  return APP_TOOLS.findIndex((tool) => tool.id === id);
}
