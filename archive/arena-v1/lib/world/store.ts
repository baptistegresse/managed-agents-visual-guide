import type { World } from "./types";

export interface Transaction<T> {
  readonly world: World;
  readonly result: T;
}

/** Détient la version courante du monde ; chaque mise à jour remplace la référence. */
export interface WorldStore {
  get(): World;
  update(change: (world: World) => World): World;
  transact<T>(change: (world: World) => Transaction<T>): T;
  subscribe(listener: () => void): () => void;
}

export function createStore(initial: World): WorldStore {
  let current = initial;
  let listeners: ReadonlyArray<() => void> = [];

  const commit = (next: World): void => {
    if (next === current) return;
    current = next;
    for (const listener of listeners) listener();
  };

  return {
    get: () => current,
    update(change) {
      commit(change(current));
      return current;
    },
    transact(change) {
      const { world, result } = change(current);
      commit(world);
      return result;
    },
    subscribe(listener) {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((candidate) => candidate !== listener);
      };
    },
  };
}
