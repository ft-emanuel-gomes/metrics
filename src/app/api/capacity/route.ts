import { NextRequest, NextResponse } from "next/server";
import { loadCapacityConfig, saveCapacityConfig } from "@/services/capacity-store";

/**
 * GET /api/capacity?squad=custodia
 * Retorna capacidades salvas para a squad (do S3).
 */
export async function GET(request: NextRequest) {
  const squad = request.nextUrl.searchParams.get("squad");
  if (!squad) {
    return NextResponse.json({ error: "Parâmetro 'squad' obrigatório" }, { status: 400 });
  }

  const data = await loadCapacityConfig(squad);
  return NextResponse.json(data);
}

/**
 * POST /api/capacity
 * Body: { squad: "custodia", sprintId: "964", teamSize: 6, businessDays: 10 }
 * Salva a capacidade no S3 e retorna confirmação.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { squad, sprintId, teamSize, businessDays } = body;

  if (!squad || !sprintId || !teamSize) {
    return NextResponse.json(
      { error: "Campos obrigatórios: squad, sprintId, teamSize" },
      { status: 400 }
    );
  }

  if (typeof teamSize !== "number" || teamSize < 1 || teamSize > 50) {
    return NextResponse.json(
      { error: "teamSize deve ser um número entre 1 e 50" },
      { status: 400 }
    );
  }

  if (businessDays && (typeof businessDays !== "number" || businessDays < 1 || businessDays > 30)) {
    return NextResponse.json(
      { error: "businessDays deve ser um número entre 1 e 30" },
      { status: 400 }
    );
  }

  await saveCapacityConfig(squad, String(sprintId), { teamSize, businessDays: businessDays || undefined });

  return NextResponse.json({
    success: true,
    message: `Capacidade salva: ${teamSize} pessoas, ${businessDays || "auto"} dias úteis para sprint ${sprintId} da squad ${squad}`,
  });
}
