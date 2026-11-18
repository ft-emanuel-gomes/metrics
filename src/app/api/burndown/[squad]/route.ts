import { NextRequest, NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { getAuthSession } from "@/services/auth-session";
import { fetchSprintBurndown } from "@/services/jira-burndown";
import { matchesFilter } from "@/services/metrics-from-raw";

// Burndown é sempre tempo real: sem cache do Next nem do app.
export const dynamic = "force-dynamic";

/** GET /api/burndown/[squad]?issueType=...&mode=cards|hours (hours = Sub-task e Sub-bug em horas) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ squad: string }> }) {
  const { squad: slug } = await params;
  const squad = getSquadBySlug(slug);
  if (!squad) return NextResponse.json({ error: "SQUAD_NOT_FOUND" }, { status: 404 });

  // Mesmas regras de acesso da página do dashboard
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!session.isAdmin && !session.allowedSquads.includes(slug)) return NextResponse.json({ error: "SQUAD_NOT_FOUND" }, { status: 404 });

  const issueTypes = request.nextUrl.searchParams.get("issueType")?.split(",").filter(Boolean);
  const mode = request.nextUrl.searchParams.get("mode") === "hours" ? "hours" : "cards";
  try {
    const data = await fetchSprintBurndown(squad, issueTypes && issueTypes.length > 0 ? (t) => matchesFilter(t, issueTypes) : undefined, mode);
    return NextResponse.json({ burndown: data, methodology: squad.methodology }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "BURNDOWN_FAILED", message: e instanceof Error ? e.message : "erro" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
