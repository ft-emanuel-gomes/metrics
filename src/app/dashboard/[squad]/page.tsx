import { notFound, redirect } from "next/navigation";
import { getSquadBySlug } from "@/config/squads";
import { createDashboardAdapter } from "@/adapters/adapter-factory";
import { DataNotAvailableError } from "@/adapters/sprint-adapter-db";
import { fetchClosedSprints } from "@/services/jira-sprints";
import { getSprintCapacity } from "@/services/capacity-store";
import { getAuthSession } from "@/services/auth-session";
import { loadRawMeta, loadRawPeriod } from "@/services/s3-raw-storage";
import { buildDashboardFromRaw } from "@/services/metrics-from-raw";
import { fetchAndSaveSprintPeriod, fetchAndSaveMonthPeriod, ensureWipAndR2 } from "@/services/s3-sync-on-demand";
import KpiCards from "@/components/dashboard/KpiCards";
import CycleTimeChart from "@/components/dashboard/CycleTimeChart";
import ThroughputDonuts from "@/components/dashboard/ThroughputDonuts";
import FlowEfficiencyBars from "@/components/dashboard/FlowEfficiencyBars";
import SpilloverDots from "@/components/dashboard/SpilloverDots";
import WipAgingChart from "@/components/dashboard/WipAgingChart";
import OccupationBars from "@/components/dashboard/OccupationBars";
import R2Progress from "@/components/dashboard/R2Progress";
import PercentilesBars from "@/components/dashboard/PercentilesBars";
import ForecastCards from "@/components/dashboard/ForecastCards";
import EvolutionTable from "@/components/dashboard/EvolutionTable";
import InsightsGrid from "@/components/dashboard/InsightsGrid";
import BugsQuality from "@/components/dashboard/BugsQuality";
import PeriodSelector from "@/components/dashboard/PeriodSelector";
import ExportButton from "@/components/dashboard/ExportButton";
import MonteCarloButton from "@/components/dashboard/MonteCarloButton";
import DesignToggle from "@/components/dashboard/DesignToggle";
import ThemeToggle from "@/components/ui/ThemeToggle";
import { formatFullDate } from "@/lib/utils";

// Desabilitar cache do Next.js (dados dinâmicos com filtros)
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ squad: string }>;
  searchParams: Promise<{ sprints?: string; months?: string; startDate?: string; endDate?: string; issueType?: string }>;
}

export default async function DashboardPage({ params, searchParams }: PageProps) {
  const { squad: slug } = await params;
  const resolvedSearch = await searchParams;
  const squad = getSquadBySlug(slug);
  if (!squad) notFound();

  // Verificar permissão do usuário para esta squad
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.isAdmin && !session.allowedSquads.includes(slug)) {
    notFound(); // Sem permissão — tratar como não encontrado
  }

  // Parse sprint IDs dos query params (se fornecidos)
  const requestedSprintIds = resolvedSearch.sprints
    ? resolvedSearch.sprints.split(",").map(Number).filter(Boolean)
    : undefined;

  // Parse months para Kanban (formato "YYYY-MM", separado por vírgula)
  const requestedMonths = resolvedSearch.months
    ? resolvedSearch.months.split(",").filter(Boolean)
    : undefined;

  // Parse issue type filter (multi-select, separado por vírgula)
  // Default: História, Task, Bug e Tech Debt sempre selecionados
  const DEFAULT_ISSUE_TYPES = ["História", "Bug", "Task", "Tech Debt"];
  const issueTypeFilter = resolvedSearch.issueType
    ? resolvedSearch.issueType.split(",").filter(Boolean)
    : DEFAULT_ISSUE_TYPES;

  // Detectar modo Design (toggle ativo)
  const isDesignMode = issueTypeFilter.length === 1 && issueTypeFilter[0] === "Design";

  // Buscar dados: S3 raw (com filtros server-side), fallback Jira on-demand
  const adapter = createDashboardAdapter(squad);

  let data;
  try {
    // Determinar quais períodos precisamos
    let periodIds: string[] = [];
    let sprintIdsToFetch: number[] = [];
    let monthsToFetch: string[] = [];

    const rawMeta = await loadRawMeta(slug).catch(() => null);

    if (squad.methodology === "sprint") {
      if (requestedSprintIds && requestedSprintIds.length > 0) {
        periodIds = requestedSprintIds.map((id) => `sprint-${id}`);
        sprintIdsToFetch = requestedSprintIds;
      } else if (rawMeta) {
        periodIds = rawMeta.sprintIds.map((id) => `sprint-${id}`);
        sprintIdsToFetch = rawMeta.sprintIds;
      }
    } else {
      if (requestedMonths && requestedMonths.length > 0) {
        periodIds = requestedMonths.map((m) => `month-${m}`);
        monthsToFetch = requestedMonths;
      } else if (rawMeta) {
        periodIds = rawMeta.monthKeys.map((m) => `month-${m}`);
        monthsToFetch = rawMeta.monthKeys;
      }
    }

    // Carregar períodos do S3 — buscar do Jira os que estiverem faltando
    if (periodIds.length > 0) {
      const periodsRaw = await Promise.all(
        periodIds.map(async (id, idx) => {
          const existing = await loadRawPeriod(slug, id).catch(() => null);
          if (existing) return existing;

          // Não existe no S3 — buscar do Jira e salvar
          if (squad.methodology === "sprint" && sprintIdsToFetch[idx]) {
            return fetchAndSaveSprintPeriod(squad, sprintIdsToFetch[idx]);
          } else if (squad.methodology === "kanban" && monthsToFetch[idx]) {
            return fetchAndSaveMonthPeriod(squad, monthsToFetch[idx]);
          }
          return null;
        })
      );

      const validPeriods = periodsRaw.filter(Boolean) as import("@/services/s3-raw-storage").RawPeriodData[];

      if (validPeriods.length > 0) {
        const { wipRaw, r2Raw } = await ensureWipAndR2(squad);
        data = buildDashboardFromRaw(squad, validPeriods, wipRaw, r2Raw, issueTypeFilter);
      }
    }

    // Fallback final: se nenhum dado disponível, buscar tudo do Jira
    if (!data) {
      data = squad.methodology === "sprint"
        ? await adapter(squad, requestedSprintIds, issueTypeFilter)
        : await adapter(squad, requestedMonths, undefined, issueTypeFilter);
    }
  } catch (error) {
    if (error instanceof DataNotAvailableError) {
      return (
        <main className="min-h-screen p-4 lg:p-6">
          <div className="mx-auto flex flex-col items-center justify-center py-20">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-8 text-center max-w-md">
              <h2 className="text-lg font-semibold text-yellow-300 mb-2">
                Dados não disponíveis
              </h2>
              <p className="text-sm text-white/70">
                A sincronização de dados para a squad <strong>{squad.name}</strong> ainda não foi concluída.
                Os dados estarão disponíveis assim que o processo de sync completar o primeiro ciclo.
              </p>
            </div>
          </div>
        </main>
      );
    }
    throw error;
  }

  // Buscar sprints disponíveis para o seletor (somente sprint squads)
  const availableSprints = squad.methodology === "sprint"
    ? (await fetchClosedSprints(squad.boardId, 10)).map((s) => ({ id: s.id, name: s.name }))
    : [];

  // Gerar meses disponíveis para Kanban (últimos 6 meses)
  const availableMonths = squad.methodology === "kanban"
    ? generateAvailableMonths(6)
    : [];

  // Meses atualmente selecionados (default: últimos 3 via data.periods)
  const currentMonths = requestedMonths || data.periods.map((p) => {
    // Extrair "YYYY-MM" do startDate do período
    return p.startDate.slice(0, 7);
  });

  const currentSprintIds = data.periods
    .filter((p) => p.type === "sprint" && p.id)
    .map((p) => p.id as number);

  // Determinar teamSize dinâmico (da sprint mais recente, salvo via Capacidade)
  const lastSprintId = currentSprintIds.length > 0 ? currentSprintIds[currentSprintIds.length - 1] : 0;
  const displayTeamSize = lastSprintId
    ? getSprintCapacity(slug, lastSprintId, squad.teamSize)
    : squad.teamSize;

  const periodLabel = data.periods.length > 0
    ? `${data.periods.map((p) => p.shortName).join(" vs ")} · ${displayTeamSize} PESSOAS`
    : "";

  const periodDates = data.periods.length > 0
    ? `Período Apurado: ${formatFullDate(data.periods[0].startDate)} a ${formatFullDate(data.periods[data.periods.length - 1].endDate)}`
    : "";

  const remaining = data.r2Progress.epics.total + data.r2Progress.features.total
    - data.r2Progress.epics.done - data.r2Progress.features.done;

  // Tipos de issue disponíveis (lista fixa — sempre mostra todas as opções)
  const allIssueTypes = ["História", "Bug", "Design", "Tech Debt", "Task", "Kaizen", "Spike"];

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto">
        {/* Header */}
        <div className="h-1 rounded mb-4" style={{ background: "linear-gradient(to right, var(--accent), #a78bfa)" }} />
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>
              {squad.name}
            </h1>
            <span className="inline-block mt-1 rounded-full px-3 py-1 text-[11px] font-bold uppercase" style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}>
              {isDesignMode ? `DESIGN · ${periodLabel}` : periodLabel}
            </span>
            <p className="mt-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>{periodDates}</p>
          </div>
          <div className="flex gap-2">
            <DesignToggle />
            <MonteCarloButton squad={slug} defaultTeamSize={displayTeamSize} availableSprints={availableSprints} />
            <ExportButton squad={slug} />
            <ThemeToggle />
          </div>
        </div>

        {/* Period Selector */}
        <div className="mt-4 no-print">
          <PeriodSelector
            methodology={squad.methodology}
            availableSprints={availableSprints}
            currentSprintIds={currentSprintIds}
            availableMonths={availableMonths}
            currentMonths={currentMonths}
            availableIssueTypes={allIssueTypes}
            currentIssueTypes={issueTypeFilter}
          />
        </div>

        {/* Última atualização + alerta de dados históricos */}
        <p className="mt-2 text-[9px]" style={{ color: "var(--text-muted)" }}>
          Última atualização: {new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>
        {data.isHistoricalFallback && (
          <div className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-[10px] text-amber-400 flex items-center gap-2">
            <span>⚠️</span>
            <span>Alguns dados foram buscados diretamente do Jira (período anterior a 3 meses). Isso pode ter impactado o tempo de carregamento.</span>
          </div>
        )}

        {/* KPI Cards */}
        <div className="mt-4">
          <KpiCards kpis={data.kpis} squad={slug} availableSprints={availableSprints} isDesignMode={isDesignMode} />
        </div>

        {/* Section 1: Performance Operacional */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CycleTimeChart
            periodMetrics={data.periodMetrics}
            stakeholderNote={data.stakeholderNote}
          />
          {!isDesignMode ? (
            <R2Progress r2Progress={data.r2Progress} />
          ) : (
            data.wipAging && <WipAgingChart wipAging={data.wipAging} />
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ThroughputDonuts periodMetrics={data.periodMetrics} />
          {!isDesignMode && <FlowEfficiencyBars periodMetrics={data.periodMetrics} />}
        </div>

        {!isDesignMode && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {squad.methodology === "sprint" && (
              <SpilloverDots periodMetrics={data.periodMetrics} />
            )}
            <OccupationBars periodMetrics={data.periodMetrics} teamSize={displayTeamSize} />
          </div>
        )}

        {/* WIP Aging + Qualidade (lado a lado) — somente Engenharia */}
        {!isDesignMode && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.wipAging && <WipAgingChart wipAging={data.wipAging} />}
            {data.bugsQuality.length > 0 && <BugsQuality data={data.bugsQuality} />}
          </div>
        )}

        {/* Section 2: Previsibilidade e Diagnóstico (somente Engenharia) */}
        {!isDesignMode && (
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PercentilesBars {...data.percentiles} />
            <ForecastCards forecast={data.forecast} />
          </div>
        )}

        {/* Evolution Table (somente Engenharia — em Design já aparece acima) */}
        {!isDesignMode && (
          <div className="mt-4">
            <EvolutionTable evolution={data.evolution} periods={data.periods} />
          </div>
        )}

        {/* Insights (em Design mode, filtrar insights irrelevantes) */}
        <div className="mt-4">
          <InsightsGrid insights={isDesignMode
            ? data.insights.filter((i) => !i.title.match(/R[23]|Feature|Release|Épico|Eficiência|eficiência|gargalo|Ocupação|ocupação/i))
            : data.insights
          } />
        </div>
      </div>
    </main>
  );
}

/**
 * Gera lista de meses disponíveis para seleção (Kanban).
 * Retorna últimos N meses no formato { value: "YYYY-MM", label: "Mai/26" }.
 */
function generateAvailableMonths(count: number): { value: string; label: string }[] {
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const today = new Date();
  const months: { value: string; label: string }[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const value = `${year}-${String(month + 1).padStart(2, "0")}`;
    const label = `${monthNames[month]}/${String(year).slice(2)}`;
    months.push({ value, label });
  }

  return months;
}
