import { NextRequest, NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { getAuthSession } from "@/services/auth-session";
import { fetchSprintCapacity } from "@/services/sprint-capacity";
import { fetchBacklogEstimate } from "@/services/backlog-estimate";
import { matchesFilter } from "@/services/metrics-from-raw";
import { DEFAULT_ISSUE_TYPES } from "@/services/dashboard-data";

// Capacidade da sprint é sempre tempo real: sem cache do Next nem do app.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ squad: string }> }) {
  const { squad: slug } = await params;
  const squad = getSquadBySlug(slug);
  if (!squad) return NextResponse.json({ error: "SQUAD_NOT_FOUND" }, { status: 404 });

  // Mesmas regras de acesso da página do dashboard
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!session.isAdmin && !session.allowedSquads.includes(slug)) return NextResponse.json({ error: "SQUAD_NOT_FOUND" }, { status: 404 });

  try {
    // Mesmo filtro de tipos da tela (e da Ocupação); sem filtro, os tipos padrão do dashboard
    const param = request.nextUrl.searchParams.get("issueType")?.split(",").filter(Boolean);
    const types = param && param.length > 0 ? param : DEFAULT_ISSUE_TYPES;
    const filter = (t: string) => matchesFilter(t, types);
    // ?mode=backlog: Backlog estimado (Selected for Development ∪ próxima sprint) × capacidade da próxima sprint
    if (request.nextUrl.searchParams.get("mode") === "backlog") {
      const backlog = await fetchBacklogEstimate(squad, filter);
      return NextResponse.json({ backlog }, { headers: { "Cache-Control": "no-store" } });
    }
    const capacity = await fetchSprintCapacity(squad, filter);
    return NextResponse.json({ capacity }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: "CAPACITY_FAILED", message: e instanceof Error ? e.message : "erro" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}