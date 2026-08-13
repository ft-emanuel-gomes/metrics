import { NextRequest, NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { createDashboardAdapter } from "@/adapters/adapter-factory";
import { DataNotAvailableError } from "@/adapters/sprint-adapter-db";
import { loadRawMeta, loadRawPeriod } from "@/services/s3-raw-storage";
import { buildDashboardFromRaw } from "@/services/metrics-from-raw";
import { fetchAndSaveSprintPeriod, fetchAndSaveMonthPeriod, ensureWipAndR2 } from "@/services/s3-sync-on-demand";

// Desabilitar cache do Next.js para esta rota (dados dinâmicos)
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ squad: string }> }
) {
  const { squad: slug } = await params;
  const squad = getSquadBySlug(slug);

  if (!squad) {
    return NextResponse.json(
      { error: "SQUAD_NOT_FOUND", message: `Squad "${slug}" não encontrada.` },
      { status: 404 }
    );
  }

  // Ler filtros dos query params
  const sprintsParam = request.nextUrl.searchParams.get("sprints");
  const monthsParam = request.nextUrl.searchParams.get("months");
  const issueTypeParam = request.nextUrl.searchParams.get("issueType");
  const sprintIds = sprintsParam ? sprintsParam.split(",").map(Number).filter(Boolean) : undefined;
  const selectedMonths = monthsParam ? monthsParam.split(",").filter(Boolean) : undefined;
  const issueTypes = issueTypeParam ? issueTypeParam.split(",").filter(Boolean) : undefined;

  // Tentar S3 raw — buscar do Jira on-demand os períodos que estiverem faltando
  try {
    const rawMeta = await loadRawMeta(slug).catch(() => null);

    let periodIds: string[] = [];
    let sprintIdsToFetch: number[] = [];
    let monthsToFetch: string[] = [];

    if (squad.methodology === "sprint") {
      if (sprintIds && sprintIds.length > 0) {
        periodIds = sprintIds.map((id) => `sprint-${id}`);
        sprintIdsToFetch = sprintIds;
      } else if (rawMeta && rawMeta.sprintIds && rawMeta.sprintIds.length > 0) {
        periodIds = rawMeta.sprintIds.map((id) => `sprint-${id}`);
        sprintIdsToFetch = rawMeta.sprintIds;
      } else if (rawMeta && rawMeta.monthKeys && rawMeta.monthKeys.length > 0) {
        // Fallback: squad mudou de kanban para sprint mas ainda tem dados mensais
        periodIds = rawMeta.monthKeys.map((m) => `month-${m}`);
        monthsToFetch = rawMeta.monthKeys;
      }
    } else {
      if (selectedMonths && selectedMonths.length > 0) {
        periodIds = selectedMonths.map((m) => `month-${m}`);
        monthsToFetch = selectedMonths;
      } else if (rawMeta) {
        periodIds = rawMeta.monthKeys.map((m) => `month-${m}`);
        monthsToFetch = rawMeta.monthKeys;
      }
    }

    if (periodIds.length > 0) {
      const periodsRaw = await Promise.all(
        periodIds.map(async (id, idx) => {
          const existing = await loadRawPeriod(slug, id).catch(() => null);
          if (existing) return existing;

          // Não existe no S3 — buscar do Jira e salvar
          if (sprintIdsToFetch[idx]) {
            return fetchAndSaveSprintPeriod(squad, sprintIdsToFetch[idx]);
          } else if (monthsToFetch[idx]) {
            return fetchAndSaveMonthPeriod(squad, monthsToFetch[idx]);
          }
          return null;
        })
      );

      const validPeriods = periodsRaw.filter(Boolean) as import("@/services/s3-raw-storage").RawPeriodData[];

      if (validPeriods.length > 0) {
        const { wipRaw, r2Raw } = await ensureWipAndR2(squad);
        const data = buildDashboardFromRaw(squad, validPeriods, wipRaw, r2Raw, issueTypes);
        return NextResponse.json({ ...data, _source: "s3-raw" });
      }
    }
  } catch {
    // S3 indisponível — fallback para Jira
  }

  // Fallback: buscar direto do Jira (on-demand)
  try {
    const adapter = createDashboardAdapter(squad);

    const data =
      squad.methodology === "sprint"
        ? await adapter(squad, sprintIds, issueTypes)
        : await adapter(squad, selectedMonths, undefined, issueTypes);

    return NextResponse.json({ ...data, _source: "jira" });
  } catch (error) {
    if (error instanceof DataNotAvailableError) {
      return NextResponse.json(
        { error: "NO_DATA_AVAILABLE", message: error.message, squadSlug: squad.slug },
        { status: 503 }
      );
    }

    console.error(`[API] Erro ao buscar métricas da squad ${slug}:`, error);

    const message =
      error instanceof Error ? error.message : "Erro interno desconhecido";

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
