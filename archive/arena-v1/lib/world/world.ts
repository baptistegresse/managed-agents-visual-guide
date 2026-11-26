import { AGENT_ACCENTS, LIMITS } from "@/lib/config";
import { boundingBox, countPixelsBySlot, createCanvas, paintCells } from "./canvas";
import type {
  Activity,
  ActivitySource,
  Approval,
  PaintCell,
  PublicApproval,
  PublicWorld,
  Tenant,
  World,
} from "./types";

export interface NewTenant {
  readonly visitorId: string;
  readonly name: string;
  readonly mission: string;
}

export interface NewActivity {
  readonly slot: number | null;
  readonly source: ActivitySource;
  readonly text: string;
}

export interface AddedTenant {
  readonly world: World;
  readonly tenant: Tenant;
}

export function createWorld(): World {
  return {
    canvas: createCanvas(),
    tenants: [],
    chat: [],
    changes: [],
    approvals: [],
    activity: [],
    nextSeq: 1,
    isPaused: false,
  };
}

export function addTenant(world: World, input: NewTenant): AddedTenant {
  const slot = world.tenants.length;
  const tenant: Tenant = {
    slot,
    visitorId: input.visitorId,
    name: input.name,
    mission: input.mission,
    accent: AGENT_ACCENTS[slot % AGENT_ACCENTS.length],
    status: "starting",
    retireReason: null,
    turn: 0,
    lastChatSeq: world.nextSeq - 1,
    lastChangeSeq: world.nextSeq - 1,
    costCents: null,
    inputTokens: 0,
    outputTokens: 0,
  };
  return { world: { ...world, tenants: [...world.tenants, tenant] }, tenant };
}

export function findTenant(world: World, slot: number): Tenant | undefined {
  return world.tenants.find((tenant) => tenant.slot === slot);
}

export function isActive(tenant: Tenant): boolean {
  return tenant.status !== "retired";
}

export function activeTenants(world: World): Tenant[] {
  return world.tenants.filter(isActive);
}

export function activeSlots(world: World): Set<number> {
  return new Set(activeTenants(world).map((tenant) => tenant.slot));
}

export function findActiveTenantByVisitor(world: World, visitorId: string): Tenant | undefined {
  return activeTenants(world).find((tenant) => tenant.visitorId === visitorId);
}

export function patchTenant(world: World, slot: number, patch: Partial<Tenant>): World {
  return {
    ...world,
    tenants: world.tenants.map((tenant) => (tenant.slot === slot ? { ...tenant, ...patch } : tenant)),
  };
}

export function addChatMessage(world: World, slot: number, text: string, now: number): World {
  const name = findTenant(world, slot)?.name ?? "?";
  const message = { seq: world.nextSeq, slot, name, text, at: now };
  return {
    ...world,
    chat: [...world.chat, message].slice(-LIMITS.chatHistorySize),
    nextSeq: world.nextSeq + 1,
  };
}

export function logActivity(world: World, entry: NewActivity, now: number): World {
  const activity: Activity = { seq: world.nextSeq, at: now, ...entry };
  return {
    ...world,
    activity: [...world.activity, activity].slice(-LIMITS.activityHistorySize),
    nextSeq: world.nextSeq + 1,
  };
}

export function applyPaint(world: World, slot: number, cells: readonly PaintCell[]): World {
  const box = boundingBox(cells);
  if (!box) return world;
  const change = { seq: world.nextSeq, slot, count: cells.length, box };
  return {
    ...world,
    canvas: paintCells(world.canvas, cells, slot),
    changes: [...world.changes, change].slice(-LIMITS.changeHistorySize),
    nextSeq: world.nextSeq + 1,
  };
}

export function addApproval(world: World, approval: Approval): World {
  return { ...world, approvals: [...world.approvals, approval] };
}

export function removeApproval(world: World, approvalId: string): World {
  return { ...world, approvals: world.approvals.filter((approval) => approval.id !== approvalId) };
}

export function removeApprovalsOf(world: World, slot: number): World {
  return { ...world, approvals: world.approvals.filter((approval) => approval.slot !== slot) };
}

export function setPaused(world: World, isPaused: boolean): World {
  return { ...world, isPaused };
}

export function describeConflicts(world: World, approval: Approval): string {
  return approval.conflicts
    .map((conflict) => `${conflict.count} px de ${findTenant(world, conflict.slot)?.name ?? "?"}`)
    .join(", ");
}

function toPublicApproval(world: World, approval: Approval): PublicApproval {
  const painter = findTenant(world, approval.slot)?.name ?? "?";
  return {
    id: approval.id,
    slot: approval.slot,
    summary: `${painter} veut repeindre ${describeConflicts(world, approval)}`,
    box: approval.box,
    createdAt: approval.createdAt,
  };
}

/** Vue envoyée aux navigateurs : identifiants de visiteur exclus. */
export function toPublicWorld(world: World, visitorId: string | null): PublicWorld {
  const pixelCounts = countPixelsBySlot(world.canvas);
  const mine = visitorId ? findActiveTenantByVisitor(world, visitorId) : undefined;
  return {
    size: world.canvas.size,
    colors: world.canvas.colors,
    owners: world.canvas.owners,
    agents: world.tenants.map((tenant) => ({
      slot: tenant.slot,
      name: tenant.name,
      mission: tenant.mission,
      accent: tenant.accent,
      status: tenant.status,
      retireReason: tenant.retireReason,
      turn: tenant.turn,
      costCents: tenant.costCents,
      pixelCount: pixelCounts.get(tenant.slot) ?? 0,
    })),
    chat: world.chat,
    activity: world.activity,
    approvals: world.approvals.map((approval) => toPublicApproval(world, approval)),
    isPaused: world.isPaused,
    mySlot: mine?.slot ?? null,
  };
}
