import { z } from "zod";
import { getArena } from "@/lib/server/arena";
import { fail, isModerator, isSameOrigin, ok, readJson } from "@/lib/server/http";

const decisionInput = z.object({ decision: z.enum(["allow", "deny"]) });

/** Le modérateur tranche un appel d'outil en attente (repeindre chez un autre agent). */
export async function POST(
  request: Request,
  context: RouteContext<"/api/moderator/approvals/[id]">,
): Promise<Response> {
  if (!isSameOrigin(request)) return fail("Origine refusée.", 403);
  if (!isModerator(request)) return fail("Clé de modérateur invalide.", 401);
  const parsed = decisionInput.safeParse(await readJson(request));
  if (!parsed.success) return fail('Attendu : { decision: "allow" | "deny" }.', 400);

  const { id } = await context.params;
  const wasResolved = await getArena().runner.decideApproval(id, parsed.data.decision);
  return wasResolved
    ? ok({ decision: parsed.data.decision })
    : fail("Cette demande n'existe plus (déjà traitée ou expirée).", 404);
}
