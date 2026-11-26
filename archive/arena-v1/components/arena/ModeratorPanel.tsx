"use client";

import { useState, type FormEvent } from "react";
import { callApi } from "@/lib/client/api";
import type { PublicApproval } from "@/lib/world/types";

interface ModeratorPanelProps {
  approvals: readonly PublicApproval[];
  isPaused: boolean;
}

const BUTTON_CLASS = "rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40";

/** Le portique humain : autoriser ou refuser qu'un agent repeigne chez un autre, et mettre en pause. */
export function ModeratorPanel({ approvals, isPaused }: ModeratorPanelProps) {
  const [draftKey, setDraftKey] = useState("");
  const [moderatorKey, setModeratorKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (request: () => Promise<{ success: boolean; error?: string }>): Promise<boolean> => {
    setIsBusy(true);
    setError(null);
    const result = await request();
    if (!result.success) setError(result.error ?? "Quelque chose a échoué.");
    setIsBusy(false);
    return result.success;
  };

  const handleUnlock = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void run(() => callApi("/api/moderator", { method: "GET", moderatorKey: draftKey })).then((isValid) => {
      if (isValid) setModeratorKey(draftKey);
    });
  };

  if (!moderatorKey) {
    return (
      <section className="rounded-lg border border-warn/40 bg-panel p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-warn">Modérateur</h2>
        <form onSubmit={handleUnlock} className="mt-3 flex gap-2">
          <input
            type="password"
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="Clé (ARENA_MODERATOR_KEY)"
            aria-label="Clé de modérateur"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-1.5 text-sm focus:border-warn focus:outline-none"
            required
          />
          <button type="submit" disabled={isBusy} className={`${BUTTON_CLASS} bg-warn text-bg`}>
            Entrer
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </section>
    );
  }

  const decide = (approvalId: string, decision: "allow" | "deny"): void => {
    void run(() =>
      callApi(`/api/moderator/approvals/${encodeURIComponent(approvalId)}`, {
        method: "POST",
        body: { decision },
        moderatorKey,
      }),
    );
  };

  return (
    <section className="rounded-lg border border-warn/40 bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-warn">Modérateur</h2>
        <button
          type="button"
          disabled={isBusy}
          onClick={() =>
            void run(() => callApi("/api/moderator", { method: "POST", body: { isPaused: !isPaused }, moderatorKey }))
          }
          className={`${BUTTON_CLASS} border border-line text-text hover:border-warn`}
        >
          {isPaused ? "Relancer l'arène" : "Mettre en pause"}
        </button>
      </div>
      {approvals.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Aucune demande en attente.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {approvals.map((approval) => (
            <li key={approval.id} className="rounded-md bg-raised p-3">
              <p className="text-sm">{approval.summary}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">
                zone x {approval.box.minX}–{approval.box.maxX}, y {approval.box.minY}–{approval.box.maxY}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => decide(approval.id, "allow")}
                  className={`${BUTTON_CLASS} bg-ok text-bg`}
                >
                  Autoriser
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => decide(approval.id, "deny")}
                  className={`${BUTTON_CLASS} border border-danger text-danger`}
                >
                  Refuser
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
