import { CANVAS_SIZE, COLOR_NAMES } from "@/lib/config";
import { createChannel, type Channel } from "./channel";
import type { AgentEvent, SessionGateway } from "./gateway";

interface SimulatedSession {
  readonly channel: Channel<AgentEvent>;
  readonly home: { readonly x: number; readonly y: number };
  isStopped: boolean;
}

const STEP_DELAY_MS = 700;
const BRUSH_SIZE = 6;
const DRIFT = 10;
const CHAT_LINES = [
  "Je m'installe par ici.",
  "Joli coin, je le garde !",
  "Quelqu'un veut faire un motif commun ?",
  "Pardon si je déborde un peu.",
  "Je continue mon œuvre.",
] as const;

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)];
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

/**
 * Agents scriptés, sans aucun appel à l'API : ils émettent les mêmes événements
 * qu'une vraie session, pour essayer l'arène gratuitement.
 */
export function createSimulatedGateway(): SessionGateway {
  const sessions = new Map<string, SimulatedSession>();
  const resultWaiters = new Map<string, () => void>();
  let sessionCount = 0;
  let toolUseCount = 0;

  async function callTool(session: SimulatedSession, name: string, input: unknown): Promise<void> {
    toolUseCount += 1;
    const id = `sim_tool_${toolUseCount}`;
    const answered = new Promise<void>((resolve) => resultWaiters.set(id, resolve));
    session.channel.push({ type: "tool_call", id, name, input });
    session.channel.push({ type: "idle", reason: "requires_action" });
    await answered;
    session.channel.push({ type: "running" });
  }

  async function playTurn(session: SimulatedSession): Promise<void> {
    await delay(STEP_DELAY_MS);
    if (session.isStopped) return;
    session.channel.push({ type: "running" });
    session.channel.push({ type: "message", text: "Je regarde où peindre ce tour-ci." });

    await delay(STEP_DELAY_MS);
    if (session.isStopped) return;
    await callTool(session, "paint_rect", {
      x: Math.min(CANVAS_SIZE - 1, session.home.x + randomInt(DRIFT)),
      y: Math.min(CANVAS_SIZE - 1, session.home.y + randomInt(DRIFT)),
      width: 1 + randomInt(BRUSH_SIZE),
      height: 1 + randomInt(BRUSH_SIZE),
      color: pick(COLOR_NAMES),
    });

    if (!session.isStopped && randomInt(2) === 0) {
      await delay(STEP_DELAY_MS);
      await callTool(session, "post_chat_message", { text: pick(CHAT_LINES) });
    }

    await delay(STEP_DELAY_MS);
    if (session.isStopped) return;
    session.channel.push({ type: "model_usage", inputTokens: 0, outputTokens: 0 });
    session.channel.push({ type: "idle", reason: "end_turn" });
  }

  const stop = (session: SimulatedSession | undefined): void => {
    if (!session) return;
    session.isStopped = true;
    session.channel.close();
  };

  return {
    async createSession(): Promise<string> {
      sessionCount += 1;
      const sessionId = `sim_session_${sessionCount}`;
      sessions.set(sessionId, {
        channel: createChannel<AgentEvent>(),
        home: { x: randomInt(CANVAS_SIZE - DRIFT), y: randomInt(CANVAS_SIZE - DRIFT) },
        isStopped: false,
      });
      return sessionId;
    },
    events(sessionId: string, signal: AbortSignal): AsyncIterable<AgentEvent> {
      const session = sessions.get(sessionId);
      if (!session) throw new Error(`Session simulée inconnue : ${sessionId}`);
      signal.addEventListener("abort", () => stop(session), { once: true });
      return session.channel;
    },
    async sendMessage(sessionId: string): Promise<void> {
      const session = sessions.get(sessionId);
      if (!session || session.isStopped) throw new Error(`Session simulée inactive : ${sessionId}`);
      void playTurn(session);
    },
    async sendToolResult(_sessionId: string, toolUseId: string): Promise<void> {
      resultWaiters.get(toolUseId)?.();
      resultWaiters.delete(toolUseId);
    },
    async interrupt(sessionId: string): Promise<void> {
      stop(sessions.get(sessionId));
    },
    async getCostCents(): Promise<number | null> {
      return null;
    },
  };
}
