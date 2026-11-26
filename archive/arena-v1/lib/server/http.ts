import { randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { MODERATOR_HEADER, VISITOR_COOKIE } from "@/lib/config";
import type { ApiResponse } from "@/lib/api";

const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function ok<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return Response.json(body, { status });
}

export function fail(error: string, status: number): Response {
  const body: ApiResponse<never> = { success: false, error };
  return Response.json(body, { status });
}

/** Refuse les requêtes d'écriture venant d'une autre origine que le site lui-même. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function getVisitorId(): Promise<string | null> {
  return (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
}

/** Identité anonyme du visiteur : un cookie httpOnly, jamais renvoyé dans les données. */
export async function ensureVisitorId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing) return existing;
  const visitorId = randomUUID();
  jar.set({
    name: VISITOR_COOKIE,
    value: visitorId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
  });
  return visitorId;
}

export function isModerator(request: Request): boolean {
  const expected = process.env.ARENA_MODERATOR_KEY;
  const provided = request.headers.get(MODERATOR_HEADER);
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}
