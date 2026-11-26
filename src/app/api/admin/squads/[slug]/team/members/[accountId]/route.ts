import { NextRequest } from "next/server";
import { actorOf, requireAdmin } from "@/services/auth-session";
import { activeMembers, removeTeamMember } from "@/services/squad-team";
import { refreshEditableSprintCapacity } from "@/services/capacity-resolver";
import { errorResponse, json, squadOr404 } from "@/services/admin-api";

export const dynamic = "force-dynamic";

/** DELETE /api/admin/squads/{slug}/team/members/{accountId} — desvincula (lógico; sprints salvas mantêm a pessoa). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string; accountId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { slug, accountId } = await params;
  const r = squadOr404(slug);
  if ("response" in r) return r.response;
  try {
    const team = await removeTeamMember(r.squad.slug, decodeURIComponent(accountId), actorOf(auth.session));
    await refreshEditableSprintCapacity(r.squad).catch((e) => console.error("[team] refresh", e));
    return json({ members: activeMembers(team) });
  } catch (error) {
    return errorResponse(error);
  }
}
