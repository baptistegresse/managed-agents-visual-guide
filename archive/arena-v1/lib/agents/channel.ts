export interface Channel<T> extends AsyncIterable<T> {
  push(value: T): void;
  close(): void;
}

/** File asynchrone à un seul lecteur : `push` côté producteur, `for await` côté lecteur. */
export function createChannel<T>(): Channel<T> {
  let queue: readonly T[] = [];
  let isClosed = false;
  let wake: (() => void) | null = null;

  const notify = (): void => {
    wake?.();
    wake = null;
  };

  async function* read(): AsyncGenerator<T> {
    while (true) {
      if (queue.length > 0) {
        const [head, ...rest] = queue;
        queue = rest;
        yield head;
        continue;
      }
      if (isClosed) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }

  return {
    push(value: T): void {
      if (isClosed) return;
      queue = [...queue, value];
      notify();
    },
    close(): void {
      isClosed = true;
      notify();
    },
    [Symbol.asyncIterator]: read,
  };
}
