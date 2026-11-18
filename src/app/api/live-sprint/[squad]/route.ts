import { NextRequest, NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { getAuthSession } from "@/services/auth-session";
import { fetchLiveSprintMetrics } from "@/services/live-sprint-metrics";
import { matchesFilter } from "@/services/metrics-from-raw";
import { DEFAULT_ISSUE_TYPES } from "@/services/dashboard-data";

// Computador de Bordo: sempre tempo real, sem cache do Next nem do app.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ squad: string }> }) {
  const { squad: slug } = await params;
  const squad = getSquadBySlug(slug);
  if (!squad) return NextResponse.json({ error: "SQUAD_NOT_FOUND" }, { status: 404 });

  // Mesmas regras de acesso da página do dashboard
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!session.isAdmin && !session.allowedSquads.includes(slug)) return NextResponse.json({ error: "SQUAD_NOT_FOUND" }, { status: 404 });

  // Mesmo filtro de tipos da tela; sem filtro, os tipos padrão do dashboard
  const param = request.nextUrl.searchParams.get("issueType")?.split(",").filter(Boolean);
  const types = param && param.length > 0 ? param : DEFAULT_ISSUE_TYPES;
  try {
    const live = await fetchLiveSprintMetrics(squad, (t) => matchesFilter(t, types));
    return NextResponse.json({ live }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { error: "LIVE_FAILED", message: e instanceof Error ? e.message : "erro" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}