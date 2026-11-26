import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaManagedAgentsSessionEvent,
  BetaManagedAgentsStreamSessionEvents,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";
import { LIMITS } from "@/lib/config";
import type { AgentEvent, IdleReason, SessionGateway } from "./gateway";

export interface AnthropicGatewayConfig {
  readonly agentId: string;
  readonly environmentId: string;
}

type RawEvent = BetaManagedAgentsSessionEvent | BetaManagedAgentsStreamSessionEvents;

const MAX_RECONNECTS = 5;
const RECONNECT_DELAY_MS = 1_000;

const IDLE_REASONS: Readonly<Record<string, IdleReason>> = {
  end_turn: "end_turn",
  requires_action: "requires_action",
  budget_reached: "budget_reached",
};

/** Ne garde du flux Managed Agents que ce dont le moteur de l'arène a besoin. */
function translate(event: RawEvent): AgentEvent | null {
  switch (event.type) {
    case "session.status_running":
      return { type: "running" };
    case "agent.custom_tool_use":
      return { type: "tool_call", id: event.id, name: event.name, input: event.input };
    case "agent.message": {
      const text = event.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      return text ? { type: "message", text } : null;
    }
    case "span.model_request_end":
      return {
        type: "model_usage",
        inputTokens:
          event.model_usage.input_tokens +
          event.model_usage.cache_read_input_tokens +
          event.model_usage.cache_creation_input_tokens,
        outputTokens: event.model_usage.output_tokens,
      };
    case "session.status_idle":
      return { type: "idle", reason: IDLE_REASONS[event.stop_reason.type] ?? "other" };
    case "session.status_terminated":
      return { type: "terminated" };
    case "session.error":
      return { type: "error", message: event.error.message || event.error.type };
    default:
      return null;
  }
}

function eventId(event: RawEvent): string | null {
  return "id" in event && typeof event.id === "string" && event.id.length > 0 ? event.id : null;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function createAnthropicGateway(config: AnthropicGatewayConfig): SessionGateway {
  // Lit ANTHROPIC_API_KEY, ou à défaut le profil créé par `ant auth login`.
  const client = new Anthropic();

  /**
   * Le flux SSE ne rejoue rien : à chaque (re)connexion on ouvre le flux, puis on
   * relit l'historique pour combler le trou, en écartant les événements déjà vus.
   */
  async function* events(sessionId: string, signal: AbortSignal): AsyncGenerator<AgentEvent> {
    const seen = new Set<string>();
    const isNew = (event: RawEvent): boolean => {
      const id = eventId(event);
      if (id === null) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    };

    let failures = 0;
    while (!signal.aborted) {
      try {
        const stream = await client.beta.sessions.events.stream(sessionId, {}, { signal });
        for await (const past of client.beta.sessions.events.list(sessionId, { order: "asc" }, { signal })) {
          const translated = isNew(past) ? translate(past) : null;
          if (translated) yield translated;
        }
        for await (const live of stream) {
          failures = 0;
          const translated = isNew(live) ? translate(live) : null;
          if (!translated) continue;
          yield translated;
          if (translated.type === "terminated") return;
        }
      } catch (error: unknown) {
        if (signal.aborted) return;
        failures += 1;
        if (failures > MAX_RECONNECTS) throw error;
      }
      await delay(RECONNECT_DELAY_MS);
    }
  }

  return {
    async createSession(title: string): Promise<string> {
      const session = await client.beta.sessions.create({
        agent: config.agentId,
        environment_id: config.environmentId,
        title,
        // Plafond de dépense imposé par la plateforme, par agent.
        budget: {
          type: "limit",
          max_list_cost: { amount: String(LIMITS.sessionBudgetCents), currency: "USD" },
        },
      });
      return session.id;
    },
    events,
    async sendMessage(sessionId: string, text: string): Promise<void> {
      await client.beta.sessions.events.send(sessionId, {
        events: [{ type: "user.message", content: [{ type: "text", text }] }],
      });
    },
    async sendToolResult(sessionId: string, toolUseId: string, text: string, isError: boolean): Promise<void> {
      await client.beta.sessions.events.send(sessionId, {
        events: [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: toolUseId,
            content: [{ type: "text", text }],
            is_error: isError,
          },
        ],
      });
    },
    async interrupt(sessionId: string): Promise<void> {
      await client.beta.sessions.events.send(sessionId, { events: [{ type: "user.interrupt" }] });
    },
    async getCostCents(sessionId: string): Promise<number | null> {
      const session = await client.beta.sessions.retrieve(sessionId);
      const cents = Number(session.usage?.list_cost?.amount);
      return Number.isFinite(cents) ? cents : null;
    },
  };
}
