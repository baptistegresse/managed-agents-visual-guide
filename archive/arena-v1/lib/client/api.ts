import type { ApiResponse } from "@/lib/api";
import { MODERATOR_HEADER } from "@/lib/config";

interface CallOptions {
  readonly method: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  readonly moderatorKey?: string;
}

/** Appelle une route de l'arène et renvoie toujours une enveloppe, même si le réseau échoue. */
export async function callApi<T>(path: string, options: CallOptions): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(path, {
      method: options.method,
      headers: {
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.moderatorKey ? { [MODERATOR_HEADER]: options.moderatorKey } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return { success: false, error: "Serveur injoignable." };
  }
}
