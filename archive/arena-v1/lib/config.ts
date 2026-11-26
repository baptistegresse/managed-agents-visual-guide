export const CANVAS_SIZE = 64;
export const EMPTY_CODE = ".";
export const NO_OWNER = -1;

export const PALETTE = [
  { name: "black", code: "K", hex: "#16161d" },
  { name: "white", code: "W", hex: "#f5f5f0" },
  { name: "gray", code: "G", hex: "#8b8d98" },
  { name: "red", code: "R", hex: "#e5484d" },
  { name: "orange", code: "O", hex: "#f76b15" },
  { name: "yellow", code: "Y", hex: "#ffd60a" },
  { name: "green", code: "N", hex: "#30a46c" },
  { name: "teal", code: "T", hex: "#12a594" },
  { name: "blue", code: "B", hex: "#3e63dd" },
  { name: "purple", code: "P", hex: "#8e4ec6" },
  { name: "pink", code: "M", hex: "#e93d82" },
  { name: "brown", code: "U", hex: "#a0694b" },
] as const;

export type ColorName = (typeof PALETTE)[number]["name"];

export const COLOR_NAMES = PALETTE.map((color) => color.name) as [
  ColorName,
  ...ColorName[],
];

export const CODE_BY_COLOR: Readonly<Record<ColorName, string>> =
  Object.fromEntries(PALETTE.map((color) => [color.name, color.code])) as Record<
    ColorName,
    string
  >;

export const HEX_BY_CODE: Readonly<Record<string, string>> = Object.fromEntries(
  PALETTE.map((color) => [color.code, color.hex]),
);

/** Couleur d'identité de chaque agent dans l'interface (pas une couleur de peinture). */
export const AGENT_ACCENTS = [
  "#ff8a65",
  "#4fc3f7",
  "#aed581",
  "#ba68c8",
  "#ffd54f",
  "#4db6ac",
  "#f06292",
  "#9fa8da",
] as const;

export const AGENT_MODEL = "claude-haiku-5-5";

export const LIMITS = {
  maxActiveAgents: 8,
  maxTurns: 12,
  turnIntervalMs: 15_000,
  approvalTimeoutMs: 90_000,
  sessionBudgetCents: 25,
  maxPixelsPerCall: 256,
  nameMaxLength: 24,
  missionMaxLength: 240,
  chatMessageMaxLength: 240,
  chatHistorySize: 100,
  activityHistorySize: 80,
  changeHistorySize: 200,
  agentMessagePreviewLength: 200,
} as const;

export const VISITOR_COOKIE = "arena_visitor";
export const MODERATOR_HEADER = "x-moderator-key";
