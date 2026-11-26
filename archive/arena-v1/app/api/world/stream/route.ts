import { connection } from "next/server";
import type { ArenaView } from "@/lib/api";
import { AGENT_MODEL, LIMITS } from "@/lib/config";
import { getArena } from "@/lib/server/arena";
import { ensureVisitorId } from "@/lib/server/http";
import { toPublicWorld } from "@/lib/world/world";

const SEND_THROTTLE_MS = 150;
const HEARTBEAT_MS = 20_000;

/** Flux SSE des spectateurs : une vue complète du monde à chaque changement. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const visitorId = await ensureVisitorId();
  const arena = getArena();
  const encoder = new TextEncoder();

  const snapshot = (): Uint8Array => {
    const view: ArenaView = {
      world: toPublicWorld(arena.store.get(), visitorId),
      settings: {
        mode: arena.mode,
        maxActiveAgents: LIMITS.maxActiveAgents,
        maxTurns: LIMITS.maxTurns,
        budgetCents: LIMITS.sessionBudgetCents,
        model: AGENT_MODEL,
      },
    };
    return encoder.encode(`data: ${JSON.stringify(view)}\n\n`);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let pending: ReturnType<typeof setTimeout> | null = null;
      const push = (chunk: Uint8Array): void => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Le navigateur est déjà parti : le nettoyage se fait sur `abort`.
        }
      };
      const scheduleSnapshot = (): void => {
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          push(snapshot());
        }, SEND_THROTTLE_MS);
      };

      push(snapshot());
      const unsubscribe = arena.store.subscribe(scheduleSnapshot);
      const heartbeat = setInterval(() => push(encoder.encode(": ping\n\n")), HEARTBEAT_MS);

      request.signal.addEventListener(
        "abort",
        () => {
          unsubscribe();
          clearInterval(heartbeat);
          if (pending) clearTimeout(pending);
          try {
            controller.close();
          } catch {
            // Flux déjà fermé.
          }
        },
        { once: true },
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
