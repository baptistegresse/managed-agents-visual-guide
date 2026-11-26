"use client";

import { useEffect, useState } from "react";
import type { ArenaView } from "@/lib/api";

export interface ArenaStream {
  readonly view: ArenaView | null;
  readonly isConnected: boolean;
}

/** S'abonne au flux du monde ; le navigateur se reconnecte tout seul en cas de coupure. */
export function useArenaStream(): ArenaStream {
  const [view, setView] = useState<ArenaView | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/world/stream");
    source.onmessage = (message: MessageEvent<string>) => {
      setView(JSON.parse(message.data) as ArenaView);
      setIsConnected(true);
    };
    source.onerror = () => setIsConnected(false);
    return () => source.close();
  }, []);

  return { view, isConnected };
}
