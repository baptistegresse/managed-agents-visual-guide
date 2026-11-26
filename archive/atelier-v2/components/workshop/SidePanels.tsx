"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { APP_TOOLS, keySpec, type KeyId, type ToolId } from "@/lib/workshop/catalog";
import { openTickets, type Ticket, type TicketKind } from "@/lib/workshop/desk";
import { ORDERS_STAND, tileStand } from "@/lib/workshop/layout";
import type { PartId } from "@/lib/workshop/parts";
import type { RunState } from "@/lib/workshop/run";
import type { WorkshopState } from "@/lib/workshop/state";
import type { Phase } from "./scene/iso";
import type { ScenePhases } from "./scene/Scene";
import { TICKET_HEX } from "./scene/voxels";

interface SidePanelProps {
  workshop: WorkshopState;
  run: RunState;
  phases: ScenePhases;
  /** La partie dont la fiche est affichée, et celle que l'introduction demande de cliquer. */
  focus: PartId;
  target: PartId | null;
  onPick: (part: PartId) => void;
}

const CARD = "flex min-h-0 flex-col gap-2 rounded-xl border p-3 text-left transition";
const ROW = "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition";
const SECTION_TITLE = "text-[10.5px] font-semibold uppercase tracking-wide";
const LIT_APP = "border-[#5b8fcb] bg-[#5b8fcb]/20";
const LIT_WORLD = "border-ok bg-ok/15";
const QUIET = "border-line bg-white/70";

const KIND_LABELS: Readonly<Record<TicketKind, string>> = {
  question: "question",
  delivery: "colis non reçu",
  refund: "remboursement",
  spam: "indésirable",
};

function isShown(phase: Phase): boolean {
  return phase !== "hidden";
}

interface ClickableProps {
  part: PartId;
  focus: PartId;
  target: PartId | null;
  onPick: (part: PartId) => void;
  className: string;
  children: ReactNode;
}

/**
 * Un bloc sur lequel on clique pour lire sa fiche. Celui que l'introduction
 * attend est entouré et marqué « clique ici ».
 */
function Clickable({ part, focus, target, onPick, className, children }: ClickableProps) {
  const isTarget = part === target;
  const pick = (event: MouseEvent): void => {
    event.stopPropagation();
    onPick(part);
  };
  const pickWithKeyboard = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onPick(part);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={pick}
      onKeyDown={pickWithKeyboard}
      className={`relative cursor-pointer outline-none hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-coral ${className} ${
        isTarget ? "ring-2 ring-coral ring-offset-2" : part === focus ? "ring-2 ring-coral/50" : ""
      }`}
    >
      {isTarget && (
        <span className="scene-alert absolute -top-2.5 right-2 rounded-full bg-coral px-2 py-0.5 text-[10px] font-bold text-white shadow">
          clique ici
        </span>
      )}
      {children}
    </div>
  );
}

/** Ce que fait le code de ton application en ce moment, d'après l'outil qu'il a en main. */
function workerActivity(run: RunState): string {
  const { worker, hop, helpers } = run;
  if (helpers.length > 0) return `${helpers.length} exécutions en parallèle`;
  if (hop?.to === "app" && hop.tone === "call") return "reçoit un appel d'outil";
  if (!worker.carrying) return "au repos";
  const isAtOrders = worker.position.x === ORDERS_STAND.x && worker.position.y === ORDERS_STAND.y;
  return isAtOrders ? "interroge ta base de commandes" : `exécute ${worker.carrying}`;
}

function toolsInUse(run: RunState): readonly (ToolId | null)[] {
  return [run.worker.carrying, ...run.helpers.map((helper) => helper.carrying)];
}

/**
 * Ton application, à gauche de la pièce : ce qui reçoit les demandes, les outils
 * custom que ton code exécute, et ta base de commandes. Chaque ligne s'allume
 * quand elle sert.
 */
export function AppPanel({ workshop, run, phases, focus, target, onPick, isWebhookOn }: SidePanelProps & { isWebhookOn: boolean }) {
  if (!isShown(phases.app)) return <div aria-hidden="true" />;
  const enabledTools = workshop.session.config?.enabledTools ?? workshop.tools.enabled;
  const inUse = toolsInUse(run);
  const { hop } = run;
  const isOrdersActive = hop?.from === "orders" || hop?.to === "orders" || workerActivity(run).startsWith("interroge");
  const click = { focus, target, onPick };
  return (
    <Clickable part="app" {...click} className={`${CARD} scene-land border-[#5b8fcb]/40 bg-[#5b8fcb]/10`}>
      <header>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#2f5f95]">Ton application</h3>
        <p className="text-[11px] text-[#2f5f95]/80">Ton code fait l&apos;action</p>
      </header>
      {isShown(phases.rack) && (
        <p className={`${ROW} ${run.worker.carrying || run.helpers.length > 0 ? LIT_APP : QUIET}`}>
          <span className="rounded bg-[#5b8fcb] px-1 font-mono text-[10px] font-bold text-white">{"</>"}</span>
          <span className="min-w-0 text-ink">
            <span className="font-semibold">Ton code</span> {workerActivity(run)}
          </span>
        </p>
      )}
      {isShown(phases.entries) && (
        <Clickable part="entries" {...click} className="flex flex-col gap-1 rounded-lg">
          <h4 className={`${SECTION_TITLE} text-[#2f5f95]`}>Points d&apos;entrée</h4>
          <p className={`${ROW} ${run.activeEntry === "api" || (hop?.from === "app" && hop.tone === "entry") ? LIT_APP : QUIET}`}>
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#e2574c]" />
            Appel API
          </p>
          <p className={`${ROW} ${run.activeEntry === "webhook" || hop?.from === "webhook" || hop?.to === "webhook" ? LIT_APP : QUIET}`}>
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#4f9fd0]" />
            <span className="flex-1">Webhook</span>
            {isWebhookOn && <span className="text-[10px] text-ok">à l&apos;écoute</span>}
          </p>
        </Clickable>
      )}
      {isShown(phases.rack) && (
        <Clickable part="tools" {...click} className="flex flex-col gap-1 rounded-lg">
          <h4 className={`${SECTION_TITLE} text-[#2f5f95]`}>Outils custom</h4>
          {APP_TOOLS.map((tool) => {
            const isEnabled = enabledTools.includes(tool.id);
            const isActive = inUse.includes(tool.id) || (hop?.to === "app" && hop.label === tool.id);
            return (
              <p
                key={tool.id}
                className={`${ROW} ${isActive ? LIT_APP : isEnabled ? QUIET : "border-dashed border-line text-muted opacity-60"}`}
              >
                <span className="flex-1 font-medium">{tool.label}</span>
                <span className="font-mono text-[10px] text-muted">{tool.id}</span>
              </p>
            );
          })}
        </Clickable>
      )}
      {isShown(phases.rack) && (
        <Clickable part="orders" {...click} className="flex flex-col gap-1 rounded-lg">
          <h4 className={`${SECTION_TITLE} text-[#2f5f95]`}>Tes données</h4>
          <p className={`${ROW} ${isOrdersActive ? LIT_APP : QUIET}`}>
            <span className="h-2.5 w-2 shrink-0 rounded-sm bg-[#5b7397]" />
            Base de commandes
          </p>
        </Clickable>
      )}
    </Clickable>
  );
}

interface TicketRowProps {
  ticket: Ticket;
  isActive: boolean;
}

/** Un ticket de la boîte de support : qui écrit, pour quoi, et où il en est. */
function TicketRow({ ticket, isActive }: TicketRowProps) {
  const status =
    ticket.status === "resolved"
      ? { text: "résolu", tone: "bg-ok/15 text-ok" }
      : ticket.status === "escalated"
        ? { text: "transmis", tone: "bg-[#ee8a2c]/20 text-[#a55a12]" }
        : { text: "en attente", tone: "bg-coral/15 text-coral-dark" };
  const notes = [
    ...(ticket.isOrderKnown ? ["commande trouvée"] : []),
    ...(ticket.isTracked ? ["colis suivi"] : []),
    ...(ticket.isRefunded ? ["remboursé"] : []),
  ];
  return (
    <li className={`scene-pop flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-xs transition ${isActive ? LIT_WORLD : QUIET}`}>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: TICKET_HEX[ticket.kind] }} />
        <span className="font-semibold text-ink">{ticket.customer}</span>
        <span className="min-w-0 flex-1 truncate text-muted">{KIND_LABELS[ticket.kind]}</span>
        <span className={`shrink-0 rounded px-1 py-px text-[10px] font-medium ${status.tone}`}>{status.text}</span>
      </span>
      <span className="truncate text-[11px] text-muted" title={ticket.subject}>
        « {ticket.subject} »
      </span>
      {notes.length > 0 && <span className="text-[10px] text-ok">{notes.join(" · ")}</span>}
    </li>
  );
}

/** Le ticket sur lequel ton code est en train d'agir, s'il y en a un. */
function isBeingHandled(ticket: Ticket, run: RunState): boolean {
  const stand = tileStand(ticket.x, ticket.y);
  const movers = [run.worker.position, ...run.helpers.map((helper) => helper.position)];
  return movers.some((position) => position.x === stand.x && position.y === stand.y);
}

function ServiceRow({ service, hasCredential, isActive }: { service: KeyId; hasCredential: boolean; isActive: boolean }) {
  return (
    <p className={`${ROW} ${isActive ? "border-[#12a594] bg-[#12a594]/15" : QUIET}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${hasCredential ? "bg-[#12a594]" : "bg-line"}`} />
      <span className="flex-1 font-medium">{keySpec(service).service}</span>
      <span className="text-[10px] text-muted">{hasCredential ? "MCP · clé au vault" : "MCP · sans clé"}</span>
    </p>
  );
}

/**
 * Le monde extérieur, à droite de la pièce : la boîte de support, où écrivent
 * les clients, et les services tiers. L'agent n'y touche jamais lui-même.
 */
export function WorldPanel({ workshop, run, phases, focus, target, onPick }: SidePanelProps) {
  if (!isShown(phases.world)) return <div aria-hidden="true" />;
  const { desk, hop } = run;
  const openCount = openTickets(desk).length;
  const touches = (service: KeyId): boolean => hop?.from === `service:${service}` || hop?.to === `service:${service}`;
  const click = { focus, target, onPick };
  return (
    <Clickable part="desk" {...click} className={`${CARD} scene-land border-ok/40 bg-ok/10`}>
      <header>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ok">La boîte de support</h3>
        <p className="text-[11px] text-ok/80">
          {openCount === 0 ? "Aucun ticket en attente" : `${openCount} ticket${openCount > 1 ? "s" : ""} en attente`} · les clients
          y écrivent
        </p>
      </header>
      <ul className={`flex min-h-0 flex-col gap-1 overflow-y-auto rounded-lg ${hop?.to === "desk" || hop?.from === "desk" ? "ring-2 ring-ok/50" : ""}`}>
        {desk.tickets.map((ticket) => (
          <TicketRow key={ticket.id} ticket={ticket} isActive={isBeingHandled(ticket, run)} />
        ))}
      </ul>
      {phases.services.length > 0 && (
        <Clickable part="services" {...click} className="flex flex-col gap-1 rounded-lg">
          <h4 className={`${SECTION_TITLE} text-[#0c7468]`}>Services tiers</h4>
          {phases.services.map((service) => (
            <ServiceRow
              key={service}
              service={service}
              hasCredential={workshop.vault.keys.includes(service)}
              isActive={touches(service)}
            />
          ))}
        </Clickable>
      )}
      {isShown(phases.web) && (
        <p className={`${ROW} ${hop?.from === "web" || hop?.to === "web" ? "border-[#3e63dd] bg-[#3e63dd]/15" : QUIET}`}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#3e63dd]" />
          Le web
        </p>
      )}
    </Clickable>
  );
}
