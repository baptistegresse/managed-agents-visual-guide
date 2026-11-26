import { joinArena, leaveArena } from "@/lib/arena/join";
import { getArena } from "@/lib/server/arena";
import { ensureVisitorId, fail, getVisitorId, isSameOrigin, ok, readJson } from "@/lib/server/http";

/** Un visiteur fait entrer son agent dans l'arène. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return fail("Origine refusée.", 403);
  const visitorId = await ensureVisitorId();
  const result = await joinArena(getArena(), visitorId, await readJson(request));
  return result.ok ? ok({ slot: result.slot }, 201) : fail(result.error, result.status);
}

/** Un visiteur retire son propre agent. */
export async function DELETE(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return fail("Origine refusée.", 403);
  const visitorId = await getVisitorId();
  const didLeave = visitorId ? await leaveArena(getArena(), visitorId) : false;
  return didLeave ? ok({ left: true }) : fail("Tu n'as pas d'agent actif.", 404);
}
