import type { SquadConfig } from "@/config/squads";
import type { DashboardData, Period } from "@/adapters/types";
import { getSprintNamer } from "@/services/sprint-display";
import { createDashboardAdapter } from "@/adapters/adapter-factory";
import { fetchClosedSprints } from "@/services/jira-sprints";
import { loadRawMeta, loadRawPeriod, type RawPeriodData } from "@/services/s3-raw-storage";
import { buildDashboardFromRaw } from "@/services/metrics-from-raw";
import { fetchAndSaveSprintPeriod, fetchAndSaveMonthPeriod, ensureWipAndR2 } from "@/services/s3-sync-on-demand";

/** Tipos de issue padrão do dashboard (quando não há filtro explícito). */
export const DEFAULT_ISSUE_TYPES = ["História", "Bug", "Task", "Tech Debt"];

export interface DashboardDataOptions {
  /** Sprints pedidas (squads Sprint). Sem isso, usa as 3 últimas sprints fechadas. */
  sprintIds?: number[];
  /** Meses pedidos (squads Kanban, "YYYY-MM"). */
  months?: string[];
  /** Filtro de tipos de issue. Sem isso, usa DEFAULT_ISSUE_TYPES. */
  issueTypes?: string[];
}

/**
 * Monta o DashboardData exatamente como o dashboard: lê os períodos do S3 raw (buscando do Jira
 * só os que faltam), usa WIP/R2 em tempo real e, se não houver nada, cai no adapter Jira-direto.
 * Compartilhado pela tela e pela exportação (PDF), para os números serem os mesmos nos dois.
 */
export async function loadDashboardData(squad: SquadConfig, options: DashboardDataOptions = {}): Promise<DashboardData> {
  const issueTypeFilter = options.issueTypes && options.issueTypes.length > 0 ? options.issueTypes : DEFAULT_ISSUE_TYPES;
  const requestedSprintIds = options.sprintIds && options.sprintIds.length > 0 ? options.sprintIds : undefined;
  const requestedMonths = options.months && options.months.length > 0 ? options.months : undefined;
  const slug = squad.slug;
  const adapter = createDashboardAdapter(squad);

  let data: DashboardData | undefined;
  let periodIds: string[] = [];
  let sprintIdsToFetch: number[] = [];
  let monthsToFetch: string[] = [];

  const rawMeta = await loadRawMeta(slug).catch(() => null);
  if (squad.methodology === "sprint") {
    if (requestedSprintIds) {
      periodIds = requestedSprintIds.map((id) => `sprint-${id}`);
      sprintIdsToFetch = requestedSprintIds;
    } else {
      // Sempre consultar o Jira para saber quais sprints estão concluídas (fonte da verdade)
      const { getCacheManager } = await import("@/cache/cache-manager");
      getCacheManager().del(`sprints:${squad.boardId}`);
      const closedSprints = await fetchClosedSprints(squad.boardId, 3).catch(() => []);
      if (closedSprints.length > 0) {
        const latestIds = closedSprints.map((s) => s.id);
        periodIds = latestIds.map((id) => `sprint-${id}`);
        sprintIdsToFetch = latestIds;
      } else if (rawMeta && rawMeta.sprintIds && rawMeta.sprintIds.length > 0) {
        periodIds = rawMeta.sprintIds.map((id) => `sprint-${id}`);
        sprintIdsToFetch = rawMeta.sprintIds;
      } else if (rawMeta && rawMeta.monthKeys && rawMeta.monthKeys.length > 0) {
        // Squad mudou de kanban para sprint mas ainda tem dados mensais no S3
        periodIds = rawMeta.monthKeys.map((m) => `month-${m}`);
        monthsToFetch = rawMeta.monthKeys;
      }
    }
  } else if (requestedMonths) {
    periodIds = requestedMonths.map((m) => `month-${m}`);
    monthsToFetch = requestedMonths;
  } else if (rawMeta) {
    periodIds = rawMeta.monthKeys.map((m) => `month-${m}`);
    monthsToFetch = rawMeta.monthKeys;
  }

  // Carregar períodos do S3; buscar do Jira (e salvar) os que estiverem faltando
  if (periodIds.length > 0) {
    const periodsRaw = await Promise.all(
      periodIds.map(async (id, idx) => {
        const existing = await loadRawPeriod(slug, id).catch(() => null);
        if (existing) return existing;
        if (sprintIdsToFetch[idx]) return fetchAndSaveSprintPeriod(squad, sprintIdsToFetch[idx]);
        if (monthsToFetch[idx]) return fetchAndSaveMonthPeriod(squad, monthsToFetch[idx]);
        return null;
      })
    );
    const validPeriods = await withSprintNames(squad, periodsRaw.filter(Boolean) as RawPeriodData[]);
    if (validPeriods.length > 0) {
      const { wipRaw, r2Raw } = await ensureWipAndR2(squad);
      data = buildDashboardFromRaw(squad, validPeriods, wipRaw, r2Raw, issueTypeFilter);
    }
  }

  // Fallback final: nenhum dado disponível no S3, buscar tudo do Jira
  if (!data) {
    data = squad.methodology === "sprint"
      ? await adapter(squad, requestedSprintIds, issueTypeFilter)
      : await adapter(squad, requestedMonths, undefined, issueTypeFilter);
    // Mesmo padrão de nome nos períodos do caminho Jira-direto
    const name = await getSprintNamer();
    const fix = (p: Period): Period => (p.type === "sprint" ? { ...p, label: name(p.label, p.startDate), shortName: name(p.label, p.startDate) } : p);
    data = { ...data, periods: data.periods.map(fix), periodMetrics: data.periodMetrics.map((m) => ({ ...m, period: fix(m.period) })) };
  }
  return data;
}

/**
 * Rótulos das sprints no padrão "Sprint N - RN" (regra em src/lib/sprint-name.ts), antes do cálculo:
 * eixos dos gráficos, comparações dos KPIs, Evolução e insights usam o mesmo nome. Não altera o S3.
 */
async function withSprintNames(squad: SquadConfig, periods: RawPeriodData[]): Promise<RawPeriodData[]> {
  if (!periods.some((p) => p.period.type === "sprint")) return periods;
  // Nome ATUAL da sprint no Jira (pode ter sido renomeada depois de gravada no S3); sem Jira, o nome gravado
  const [name, closed] = await Promise.all([
    getSprintNamer(),
    fetchClosedSprints(squad.boardId, Number.MAX_SAFE_INTEGER).catch(() => []),
  ]);
  const jiraName = new Map(closed.map((s) => [s.id, s.name]));
  return periods.map((p) => {
    if (p.period.type !== "sprint") return p;
    const display = name((p.period.id !== undefined && jiraName.get(p.period.id)) || p.period.label, p.period.startDate);
    return { ...p, period: { ...p.period, label: display, shortName: display } };
  });
}