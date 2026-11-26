"use client";

import type { Dispatch } from "react";
import {
  AGENT_MODEL,
  KEY_CATALOG,
  keySpec,
  TOOL_CATALOG,
  type ToolSpec,
} from "@/lib/workshop/catalog";
import type { SandboxPolicy } from "@/lib/workshop/effects";
import type { WorkshopAction, WorkshopState } from "@/lib/workshop/state";
import { useUnlocked } from "./guide";
import { ChoiceCard, FIELD_CLASS, PrimaryButton, usePendingCreate } from "./ui";

interface StepFormProps {
  workshop: WorkshopState;
  dispatch: Dispatch<WorkshopAction>;
}

export const HINT = "text-sm leading-relaxed text-muted";

const SANDBOX_CHOICES: ReadonlyArray<{
  policy: SandboxPolicy;
  title: string;
  description: string;
}> = [
  {
    policy: "always_allow",
    title: "Oui, sans demander",
    description: "L'agent lance ses commandes librement.",
  },
  {
    policy: "always_ask",
    title: "Oui, avec mon accord",
    description: "Chaque commande attend que tu l'autorises.",
  },
  {
    policy: "auto",
    title: "Oui, la plateforme juge",
    description:
      "Chaque commande est évaluée : sûre, elle part ; risquée, elle est refusée ; incertaine, elle t'est soumise.",
  },
  {
    policy: "off",
    title: "Non",
    description: "Pas de bash ni de fichiers : seulement les outils du support.",
  },
];
const LABEL = "text-xs font-medium uppercase tracking-wide text-muted";

export function EnvironmentForm({ workshop, dispatch }: StepFormProps) {
  const { isBusy, create } = usePendingCreate();
  const { name, networking } = workshop.environment;
  return (
    <div className="flex flex-col gap-3">
      <p className={HINT}>
        L&apos;environnement est la pièce où ton agent travaille : un conteneur
        isolé, recréé pour chaque session.
      </p>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Nom</span>
        <input
          className={FIELD_CLASS}
          value={name}
          maxLength={32}
          onChange={(event) =>
            dispatch({
              type: "environmentEdited",
              name: event.target.value,
              networking,
            })
          }
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Réseau</span>
        <ChoiceCard
          isSelected={networking === "limited"}
          onClick={() =>
            dispatch({ type: "environmentEdited", name, networking: "limited" })
          }
          title="Isolé"
          description="Rien ne sort de la pièce, sauf ce que tu autorises."
        />
        <ChoiceCard
          isSelected={networking === "unrestricted"}
          onClick={() =>
            dispatch({
              type: "environmentEdited",
              name,
              networking: "unrestricted",
            })
          }
          title="Ouvert"
          description="L'agent peut joindre Internet depuis la pièce."
        />
      </div>
      <PrimaryButton
        isBusy={isBusy}
        isDisabled={name.trim().length === 0}
        onClick={() =>
          create("env", (id) => dispatch({ type: "environmentCreated", id }))
        }
      >
        Créer l&apos;environnement
      </PrimaryButton>
    </div>
  );
}

export function VaultForm({ workshop, dispatch }: StepFormProps) {
  const { isBusy, create } = usePendingCreate();
  const { keys } = workshop.vault;
  return (
    <div className="flex flex-col gap-3">
      <p className={HINT}>
        As-tu des clés à confier à ton agent ? Le vault les garde au coffre,
        côté Anthropic. Ce sont les identifiants des services tiers que
        l&apos;agent appelle sans passer par toi : la plateforme les joint à
        l&apos;appel, l&apos;agent ne les voit jamais. Tes outils custom, eux,
        deskt leurs secrets dans ton application.
      </p>
      <div className="flex flex-col gap-2">
        {KEY_CATALOG.map((key) => (
          <ChoiceCard
            key={key.id}
            isSelected={keys.includes(key.id)}
            onClick={() => dispatch({ type: "keyToggled", key: key.id })}
            title={key.label}
            description={`Sert à ${key.purpose}.`}
          />
        ))}
      </div>
      <PrimaryButton
        isBusy={isBusy}
        onClick={() =>
          create("vlt", (id) => dispatch({ type: "vaultCreated", id }))
        }
      >
        {keys.length === 0
          ? "Créer le vault sans clé"
          : `Créer le vault avec ${keys.length} clé${keys.length > 1 ? "s" : ""}`}
      </PrimaryButton>
    </div>
  );
}

/** Qui exécute l'outil : ton application, ou le service tiers auquel il appartient. */
function toolNote(tool: ToolSpec, isKeyMissing: boolean): string {
  if (tool.requiresKey === null) return "Outil custom : exécuté par ton application.";
  const key = keySpec(tool.requiresKey);
  const approval = tool.needsApproval ? " Chaque appel attend ton accord." : "";
  return isKeyMissing
    ? `Outil du service ${key.service} (MCP) : sans la « ${key.label} » dans le vault, l'appel sera refusé.${approval}`
    : `Outil du service ${key.service} (MCP) : la plateforme l'appelle avec la « ${key.label} » du vault.${approval}`;
}

export function ToolsForm({ workshop, dispatch }: StepFormProps) {
  const unlocked = useUnlocked();
  const { enabled } = workshop.tools;
  return (
    <div className="flex flex-col gap-3">
      <p className={HINT}>
        Quels outils donnes-tu à ton agent ? Il ne pourra rien faire
        d&apos;autre. C&apos;est lui qui décide de les appeler ; qui les
        exécute dépend de l&apos;outil : ton application pour un outil custom,
        un service tiers pour les autres.
      </p>
      <div className="flex flex-col gap-2">
        {TOOL_CATALOG.map((tool) => {
          const isKeyMissing =
            tool.requiresKey !== null &&
            !workshop.vault.keys.includes(tool.requiresKey);
          return (
            <ChoiceCard
              key={tool.id}
              isSelected={enabled.includes(tool.id)}
              onClick={() => dispatch({ type: "toolToggled", tool: tool.id })}
              title={`${tool.label} · ${tool.id}`}
              description={tool.description}
              note={
                <span
                  className={`mt-1 block text-xs ${tool.requiresKey === null ? "text-muted" : isKeyMissing ? "text-danger" : "text-ok"}`}
                >
                  {toolNote(tool, isKeyMissing)}
                </span>
              }
            />
          );
        })}
      </div>
      {unlocked("sandbox") && (
        <div className="flex flex-col gap-2">
          <span className={LABEL}>Bac à sable (bash, fichiers)</span>
          <p className="text-xs leading-snug text-muted">
            Ces outils-là s&apos;exécutent dans le conteneur, chez Anthropic,
            sans passer par ton application.
          </p>
          {SANDBOX_CHOICES.filter(
            (choice) => choice.policy !== "auto" || unlocked("advanced"),
          ).map((choice) => (
            <ChoiceCard
              key={choice.policy}
              isSelected={workshop.tools.sandbox === choice.policy}
              onClick={() =>
                dispatch({ type: "sandboxChosen", policy: choice.policy })
              }
              title={choice.title}
              description={choice.description}
            />
          ))}
        </div>
      )}
      {unlocked("advanced") && (
        <ChoiceCard
          isSelected={workshop.tools.hasWeb}
          onClick={() => dispatch({ type: "webToggled" })}
          title="Recherche et lecture web"
          description={
            workshop.tools.sandbox === "off"
              ? "Indisponible : ces outils font partie de la boîte à outils intégrée."
              : "Limitées à un seul site autorisé, transporteur.example. Elles tournent chez Anthropic."
          }
          note={
            workshop.tools.hasWeb &&
            workshop.environment.networking === "limited" && (
              <span className="mt-1 block text-xs text-danger">
                Ton environnement est en réseau isolé : la plateforme bloque
                aussi ces outils, ils ne ramèneront rien.
              </span>
            )
          }
        />
      )}
      <PrimaryButton
        isDisabled={enabled.length === 0}
        onClick={() => dispatch({ type: "toolsConfirmed" })}
      >
        Donner {enabled.length} outil{enabled.length > 1 ? "s" : ""} à
        l&apos;agent
      </PrimaryButton>
    </div>
  );
}

export function AgentForm({ workshop, dispatch }: StepFormProps) {
  const unlocked = useUnlocked();
  const { isBusy, create } = usePendingCreate();
  const { name, system } = workshop.agent;
  return (
    <div className="flex flex-col gap-3">
      <p className={HINT}>
        L&apos;agent, c&apos;est la configuration : un modèle, des consignes et
        les outils choisis. Il est créé une fois, puis réutilisé à chaque
        session.
      </p>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Nom</span>
        <input
          className={FIELD_CLASS}
          value={name}
          maxLength={24}
          onChange={(event) =>
            dispatch({ type: "agentEdited", name: event.target.value, system })
          }
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Consignes (prompt système)</span>
        <textarea
          className={`${FIELD_CLASS} min-h-20 resize-none`}
          value={system}
          maxLength={400}
          onChange={(event) =>
            dispatch({ type: "agentEdited", name, system: event.target.value })
          }
        />
      </label>
      {unlocked("advanced") && (
        <ChoiceCard
          isSelected={workshop.agent.canDelegate}
          onClick={() => dispatch({ type: "delegationToggled" })}
          title="Peut déléguer"
          description="Pour un gros travail, il le partage entre des copies de lui-même, qui avancent en parallèle."
        />
      )}
      {unlocked("advanced") && (
        <ChoiceCard
          isSelected={workshop.agent.hasSkill}
          onClick={() => dispatch({ type: "skillToggled" })}
          title="Skill : procédure de remboursement"
          description={
            workshop.tools.sandbox === "off"
              ? "Indisponible : un skill est un dossier que l'agent lit, il faut le bac à sable."
              : "Un savoir-faire rangé dans sa bibliothèque : il ne le charge que pour traiter un remboursement."
          }
        />
      )}
      <p className="font-mono text-xs text-muted">modèle : {AGENT_MODEL}</p>
      <PrimaryButton
        isBusy={isBusy}
        isDisabled={name.trim().length === 0}
        onClick={() =>
          create("agent", (id) => dispatch({ type: "agentCreated", id }))
        }
      >
        Créer l&apos;agent
      </PrimaryButton>
    </div>
  );
}
