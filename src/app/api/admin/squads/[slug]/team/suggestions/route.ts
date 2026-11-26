import { NextRequest } from "next/server";
import { requireAdmin } from "@/services/auth-session";
import { activeMembers, getSquadTeam } from "@/services/squad-team";
import { suggestSquadMembers } from "@/services/jira-users";
import { json, squadOr404 } from "@/services/admin-api";

export const dynamic = "force-dynamic";

/** GET /api/admin/squads/{slug}/team/suggestions — responsáveis das últimas sprints, marcando quem já está vinculado. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = squadOr404((await params).slug);
  if ("response" in r) return r.response;
  try {
    const [people, team] = await Promise.all([suggestSquadMembers(r.squad), getSquadTeam(r.squad.slug)]);
    const linked = new Set(activeMembers(team).map((m) => m.accountId));
    return json({ suggestions: people.map((p) => ({ ...p, linked: linked.has(p.accountId) })) });
  } catch (error) {
    return json({ error: "JIRA_UNAVAILABLE", message: "Não foi possível buscar as sugestões no Jira agora.", detail: error instanceof Error ? error.message : undefined }, 502);
  }
}
