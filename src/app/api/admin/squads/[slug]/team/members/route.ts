import { NextRequest } from "next/server";
import { actorOf, requireAdmin } from "@/services/auth-session";
import { activeMembers, addTeamMember } from "@/services/squad-team";
import { fetchJiraUser } from "@/services/jira-users";
import { refreshEditableSprintCapacity } from "@/services/capacity-resolver";
import { badRequest, errorResponse, json, squadOr404 } from "@/services/admin-api";

export const dynamic = "force-dynamic";

/** POST /api/admin/squads/{slug}/team/members { accountId } — vincula uma pessoa do Jira à squad. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = squadOr404((await params).slug);
  if ("response" in r) return r.response;
  const body = await request.json().catch(() => null);
  const accountId = typeof body?.accountId === "string" ? body.accountId.trim() : "";
  if (!accountId) return badRequest("Informe o accountId da pessoa no Jira.");
  try {
    // Nome e foto sempre do Jira (nunca do navegador)
    const person = await fetchJiraUser(accountId);
    if (!person) return badRequest("Pessoa não encontrada no Jira.");
    const team = await addTeamMember(r.squad.slug, person, actorOf(auth.session));
    await refreshEditableSprintCapacity(r.squad).catch((e) => console.error("[team] refresh", e));
    return json({ members: activeMembers(team) });
  } catch (error) {
    return errorResponse(error);
  }
}
