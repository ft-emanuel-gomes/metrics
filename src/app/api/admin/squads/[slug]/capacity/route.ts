import { NextRequest } from "next/server";
import { requireAdmin } from "@/services/auth-session";
import { fetchEditableSprint } from "@/services/jira-sprints";
import { getSprintNamer } from "@/services/sprint-display";
import { errorResponse, json, squadOr404 } from "@/services/admin-api";

export const dynamic = "force-dynamic";

/** GET /api/admin/squads/{slug}/capacity — sprint editável da squad (vigente; sem vigente, a próxima). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = squadOr404((await params).slug);
  if ("response" in r) return r.response;
  try {
    const sprint = await fetchEditableSprint(r.squad.boardId);
    if (!sprint) return json({ sprint: null });
    const name = (await getSprintNamer())(sprint.name, sprint.startDate ?? new Date().toISOString());
    return json({ sprint: { id: sprint.id, name, state: sprint.state, startDate: sprint.startDate, endDate: sprint.endDate } });
  } catch (error) {
    return errorResponse(error);
  }
}
