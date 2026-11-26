import { z } from "zod";
import { getArena } from "@/lib/server/arena";
import { fail, isModerator, isSameOrigin, ok, readJson } from "@/lib/server/http";

const pauseInput = z.object({ isPaused: z.boolean() });

/** Vérifie la clé du modérateur. */
export async function GET(request: Request): Promise<Response> {
  return isModerator(request) ? ok({ isModerator: true }) : fail("Clé de modérateur invalide.", 401);
}

/** Met l'arène en pause ou la relance : en pause, plus aucun tour n'est envoyé aux agents. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return fail("Origine refusée.", 403);
  if (!isModerator(request)) return fail("Clé de modérateur invalide.", 401);
  const parsed = pauseInput.safeParse(await readJson(request));
  if (!parsed.success) return fail("Attendu : { isPaused: boolean }.", 400);
  getArena().runner.setPaused(parsed.data.isPaused);
  return ok({ isPaused: parsed.data.isPaused });
}
