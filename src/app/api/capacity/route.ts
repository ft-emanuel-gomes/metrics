import { NextRequest, NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { getAuthSession } from "@/services/auth-session";
import { loadCapacityConfig, saveCapacityConfig } from "@/services/capacity-store";

// Capacidade muda por ação do administrador: sem cache do Next.
export const dynamic = "force-dynamic";

/**
 * GET /api/capacity?squad=custodia
 * Retorna capacidades salvas para a squad (do S3).
 * Exige login e acesso à squad (mesma regra do dashboard).
 */
export async function GET(request: NextRequest) {
  const squad = request.nextUrl.searchParams.get("squad");
  if (!squad) {
    return NextResponse.json({ error: "Parâmetro 'squad' obrigatório" }, { status: 400 });
  }
  if (!getSquadBySlug(squad)) return NextResponse.json({ error: "SQUAD_NOT_FOUND" }, { status: 404 });

  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!session.isAdmin && !session.allowedSquads.includes(squad)) return NextResponse.json({ error: "SQUAD_NOT_FOUND" }, { status: 404 });

  const data = await loadCapacityConfig(squad);
  return NextResponse.json(data);
}

/**
 * POST /api/capacity
 * Body: { squad: "custodia", sprintId: "964", teamSize: 6, businessDays: 10 }
 * businessDays é opcional: ausente = automático (dias úteis pelas datas da sprint no Jira).
 * Vale para sprint concluída, vigente ou próxima. Somente administrador.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "Somente administradores podem alterar a capacidade." }, { status: 403 });

  const body = await request.json();
  const { squad, sprintId, teamSize, businessDays } = body;

  if (!squad || !sprintId || !teamSize) {
    return NextResponse.json(
      { error: "Campos obrigatórios: squad, sprintId, teamSize" },
      { status: 400 }
    );
  }

  if (!getSquadBySlug(String(squad))) {
    return NextResponse.json({ error: "Squad inválida" }, { status: 400 });
  }

  if (!/^\d+$/.test(String(sprintId))) {
    return NextResponse.json({ error: "sprintId inválido" }, { status: 400 });
  }

  if (typeof teamSize !== "number" || teamSize < 1 || teamSize > 50) {
    return NextResponse.json(
      { error: "teamSize deve ser um número entre 1 e 50" },
      { status: 400 }
    );
  }

  if (businessDays && (typeof businessDays !== "number" || !Number.isInteger(businessDays) || businessDays < 1 || businessDays > 30)) {
    return NextResponse.json(
      { error: "businessDays deve ser um número inteiro entre 1 e 30" },
      { status: 400 }
    );
  }

  await saveCapacityConfig(squad, String(sprintId), { teamSize, businessDays: businessDays || undefined });

  return NextResponse.json({
    success: true,
    message: `Capacidade salva: ${teamSize} pessoas, ${businessDays || "auto"} dias úteis para sprint ${sprintId} da squad ${squad}`,
  });
}
