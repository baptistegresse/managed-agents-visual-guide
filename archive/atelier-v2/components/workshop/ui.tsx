"use client";

import { useState, type ReactNode } from "react";

export const FIELD_CLASS =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-coral focus:outline-none";

interface PrimaryButtonProps {
  children: ReactNode;
  onClick: () => void;
  isBusy?: boolean;
  isDisabled?: boolean;
}

export function PrimaryButton({ children, onClick, isBusy = false, isDisabled = false }: PrimaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy || isDisabled}
      className="w-full rounded-lg bg-coral px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-coral-dark disabled:opacity-45"
    >
      {isBusy ? "Création…" : children}
    </button>
  );
}

interface ChoiceCardProps {
  isSelected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  note?: ReactNode;
}

/** Une carte à cocher : sert pour le réseau, les clés et les outils. */
export function ChoiceCard({ isSelected, onClick, title, description, note }: ChoiceCardProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
        isSelected ? "border-coral bg-coral/10" : "border-line bg-white hover:border-coral/50"
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
          isSelected ? "border-coral bg-coral text-white" : "border-line bg-white text-transparent"
        }`}
      >
        ✓
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs leading-snug text-muted">{description}</span>
        {note}
      </span>
    </button>
  );
}

const SIMULATED_DELAY_MS = 450;
const ID_LENGTH = 6;

/** En simulation, « créer » une ressource prend un instant et renvoie un identifiant factice. */
export function usePendingCreate(): { isBusy: boolean; create: (prefix: string, onCreated: (id: string) => void) => void } {
  const [isBusy, setIsBusy] = useState(false);
  const create = (prefix: string, onCreated: (id: string) => void): void => {
    setIsBusy(true);
    setTimeout(() => {
      setIsBusy(false);
      onCreated(`${prefix}_sim_${Math.random().toString(36).slice(2, 2 + ID_LENGTH)}`);
    }, SIMULATED_DELAY_MS);
  };
  return { isBusy, create };
}
