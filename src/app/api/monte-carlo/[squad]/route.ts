import { NextRequest, NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { runMonteCarloSimulation, buildDailyThroughput } from "@/metrics/monte-carlo";
import { loadRawPeriod } from "@/services/s3-raw-storage";
import { fetchAndSaveSprintPeriod } from "@/services/s3-sync-on-demand";
import type { RawPeriodData } from "@/services/s3-raw-storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/monte-carlo/[squad]
 * Executa simulação Monte Carlo baseada no throughput DIÁRIO das sprints selecionadas.
 *
 * Query params:
 *   sprints: "921,925,966" (IDs das sprints para base histórica)
 *   issueType: "História,Bug,Task" (filtro de tipos)
 *   itemCount: "30" (itens a entregar)
 *   teamSize: "5" (pessoas disponíveis)
 *   startDate: "2026-07-31" (início do desenvolvimento)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ squad: string }> }
) {
  const { squad: slug } = await params;
  const squad = getSquadBySlug(slug);

  if (!squad) {
    return NextResponse.json({ error: "Squad não encontrada" }, { status: 404 });
  }

  const sprintsParam = request.nextUrl.searchParams.get("sprints");
  const issueTypeParam = request.nextUrl.searchParams.get("issueType");
  const itemCountParam = request.nextUrl.searchParams.get("itemCount");
  const teamSizeParam = request.nextUrl.searchParams.get("teamSize");
  const startDateParam = request.nextUrl.searchParams.get("startDate");

  if (!sprintsParam || !itemCountParam || !startDateParam) {
    return NextResponse.json(
      { error: "MISSING_PARAMS", message: "Parâmetros obrigatórios: sprints, itemCount, startDate" },
      { status: 400 }
    );
  }

  const sprintIds = sprintsParam.split(",").map(Number).filter(Boolean);
  const issueTypes = issueTypeParam ? issueTypeParam.split(",").filter(Boolean) : undefined;
  const itemCount = Number(itemCountParam);
  const teamSize = Number(teamSizeParam) || squad.teamSize;
  const startDate = startDateParam;

  try {
    // Carregar dados brutos das sprints selecionadas
    const periodsRaw: RawPeriodData[] = [];

    for (const sprintId of sprintIds) {
      let period = await loadRawPeriod(slug, `sprint-${sprintId}`).catch(() => null);
      if (!period) {
        period = await fetchAndSaveSprintPeriod(squad, sprintId);
      }
      if (period) periodsRaw.push(period);
    }

    if (periodsRaw.length === 0) {
      return NextResponse.json(
        { error: "NO_DATA", message: "Nenhum dado encontrado para as sprints selecionadas." },
        { status: 404 }
      );
    }

    // Extrair datas de conclusão de cada issue (filtradas por tipo)
    // A data de conclusão é a última transição para "Concluído" no changelog
    const completionDates: string[] = [];

    for (const raw of periodsRaw) {
      let issues = raw.completedIssues;

      // Aplicar filtro de tipo
      if (issueTypes && issueTypes.length > 0) {
        issues = issues.filter((i) =>
          issueTypes.includes(i.issueType) || issueTypes.includes(normalizeType(i.issueType))
        );
      }

      // Extrair a data de conclusão de cada issue (última transição para Done)
      for (const issue of issues) {
        const doneTransition = [...issue.transitions]
          .reverse()
          .find((t) => ["Concluído", "Done", "Closed", "Finalizado"].includes(t.toStatus));

        if (doneTransition) {
          completionDates.push(doneTransition.timestamp);
        } else if (issue.resolutionDate) {
          completionDates.push(issue.resolutionDate);
        }
      }
    }

    if (completionDates.length === 0) {
      return NextResponse.json(
        { error: "NO_COMPLETIONS", message: "Nenhum item concluído encontrado no período." },
        { status: 404 }
      );
    }

    // Determinar período completo (start da primeira sprint ao end da última)
    const sortedPeriods = [...periodsRaw].sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
    const periodStart = sortedPeriods[0].period.startDate;
    const periodEnd = sortedPeriods[sortedPeriods.length - 1].period.endDate;

    // Construir throughput diário (quantos itens concluídos por dia útil)
    const dailyThroughput = buildDailyThroughput(completionDates, periodStart, periodEnd);

    // Executar simulação Monte Carlo
    const result = runMonteCarloSimulation({
      dailyThroughput,
      itemCount,
      defaultTeamSize: squad.teamSize,
      simulationTeamSize: teamSize,
      startDate,
    });

    return NextResponse.json({
      ...result,
      // Dados extras para o frontend
      historicalPeriod: `${periodStart} a ${periodEnd}`,
      totalItemsInPeriod: completionDates.length,
      totalBusinessDays: dailyThroughput.length,
    });
  } catch (error) {
    console.error(`[Monte Carlo] Erro para squad ${slug}:`, error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: "INTERNAL_ERROR", message }, { status: 500 });
  }
}

function normalizeType(type: string): string {
  const mapping: Record<string, string> = {
    Story: "História",
    História: "História",
    Bug: "Bug",
    Design: "Design",
    "Technical Debt": "Tech Debt",
    "Dívida Técnica": "Tech Debt",
    Task: "Task",
    Kaizen: "Kaizen",
    Spike: "Spike",
  };
  return mapping[type] || type;
}
