import { NextRequest } from "next/server";
import { actorOf, requireAdmin } from "@/services/auth-session";
import { activeMembers, getGlobalSettings, getSquadTeam, setSquadHoursPerDay, syncTeamProfiles } from "@/services/squad-team";
import { fetchJiraUsers } from "@/services/jira-users";
import { refreshEditableSprintCapacity } from "@/services/capacity-resolver";
import { badRequest, errorResponse, json, squadOr404 } from "@/services/admin-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * GET /api/admin/squads/{slug}/team — integrantes ativos (nome e foto conferidos no Jira) e horas por dia.
 * A conferência no Jira é best-effort: se falhar, devolve o que está gravado.
 */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = squadOr404((await params).slug);
  if ("response" in r) return r.response;
  try {
    let team = await getSquadTeam(r.squad.slug);
    const ids = activeMembers(team).map((m) => m.accountId);
    let jiraChecked = false;
    if (ids.length > 0) {
      try {
        const fromJira = await fetchJiraUsers(ids);
        team = await syncTeamProfiles(r.squad.slug, fromJira, actorOf(auth.session));
        jiraChecked = true;
      } catch {
        // Jira indisponível: segue com os dados gravados
      }
    }
    const settings = await getGlobalSettings();
    return json({
      members: activeMembers(team),
      hoursPerDay: team.hoursPerDay ?? null,
      hoursPerDayDefault: settings.hoursPerDayDefault,
      jiraChecked,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PUT /api/admin/squads/{slug}/team { hoursPerDay: number | null } — horas por dia da squad (null = padrão global). */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = squadOr404((await params).slug);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  if (!body || !("hoursPerDay" in body)) return badRequest("Informe hoursPerDay (ou null para usar o padrão global).");
  try {
    const team = await setSquadHoursPerDay(r.squad.slug, body.hoursPerDay === null ? null : body.hoursPerDay, actorOf(auth.session));
    await refreshEditableSprintCapacity(r.squad).catch((e) => console.error("[team] refresh", e));
    return json({ hoursPerDay: team.hoursPerDay ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
