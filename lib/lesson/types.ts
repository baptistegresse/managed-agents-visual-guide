import type { KeyId } from "@/lib/workshop/catalog";
import type { Effect, Hop, Place } from "@/lib/workshop/effects";
import type { RunCommand } from "@/lib/workshop/run";

/** Une pièce de la scène : la leçon les pose une à une dans la pièce de l'agent. */
export type Piece = "agent" | "room" | "vault" | "bed" | "context" | "bench" | "memory" | "library" | "clock";

export type Networking = "limited" | "unrestricted";

/** Un morceau de fichier qu'une étape peut mettre en lumière. */
export interface CodeBlock {
  readonly id: string;
  readonly lines: readonly string[];
}

/** Un fichier du backend, découpé en blocs dans l'ordre où on les lit. */
export interface CodeFile {
  readonly name: string;
  readonly blocks: readonly CodeBlock[];
}

/** Le code qu'une étape éclaire : un fichier, et ceux de ses blocs qui comptent à ce moment-là. */
export interface CodeFocus {
  readonly file: string;
  readonly blocks: readonly string[];
}

/** Ce qu'une étape change dans la scène : un effet d'animation, ou une commande sur la session. */
export type StepAction = Effect | RunCommand;

/** Ce qui reste vrai une fois posé, jusqu'à ce qu'une étape le change. */
export interface SceneFacts {
  readonly vaultKeys: readonly KeyId[];
  readonly networking: Networking;
  /** Un fichier a été monté dans le conteneur. */
  readonly hasMountedFile: boolean;
  /** La version de l'agent sur laquelle tourne la session. */
  readonly agentVersion: number;
}

/** Ce qu'une étape pose ou change dans la scène. */
export interface SceneChange {
  /** Les pièces ajoutées à la scène. */
  readonly adds?: readonly Piece[];
  readonly sets?: Partial<SceneFacts>;
  readonly actions?: readonly StepAction[];
}

export interface LessonStep extends SceneChange {
  readonly id: string;
  /** Le nom de la partie à laquelle l'étape appartient, quand la leçon en a plusieurs. */
  readonly section?: string;
  readonly title: string;
  /** Une à trois phrases : ce qui se passe, et ce qu'il faut en retenir. */
  readonly text: readonly string[];
  readonly code: CodeFocus;
}

/** Une leçon : un scénario qu'on suit étape par étape, à côté du code qui le réalise. */
export interface Lesson {
  readonly id: string;
  readonly title: string;
  /** Une phrase pour la liste des chapitres. */
  readonly summary: string;
  /**
   * La scène telle que les chapitres précédents l'ont laissée : posée d'emblée,
   * avant la première étape, sans rien raconter.
   */
  readonly before?: SceneChange;
  readonly files: readonly CodeFile[];
  readonly steps: readonly LessonStep[];
}

/** Un appel qui voyage : il reste affiché le temps de l'étape. */
export function hop(from: Place, to: Place, label: string, tone: Hop["tone"]): Effect {
  return { type: "hop", hop: { from, to, label, tone } };
}
