import { notFound, redirect } from "next/navigation";
import { getSquadBySlug } from "@/config/squads";
import { DataNotAvailableError } from "@/adapters/sprint-adapter-db";
import { getSprintCapacity } from "@/services/capacity-store";
import { getAuthSession } from "@/services/auth-session";
import { fetchClosedSprints } from "@/services/jira-sprints";
import { loadDashboardData, DEFAULT_ISSUE_TYPES } from "@/services/dashboard-data";
import KpiCards from "@/components/dashboard/KpiCards";
import CycleTimeChart from "@/components/dashboard/CycleTimeChart";
import ThroughputVsCycleTime from "@/components/dashboard/ThroughputVsCycleTime";
import ThroughputDonuts from "@/components/dashboard/ThroughputDonuts";
import FlowEfficiencyBars from "@/components/dashboard/FlowEfficiencyBars";
import WipAgingChart from "@/components/dashboard/WipAgingChart";
import SprintBurndown from "@/components/dashboard/SprintBurndown";
import LiveSprintMetrics from "@/components/dashboard/LiveSprintMetrics";
import OccupationBars from "@/components/dashboard/OccupationBars";
import R2Progress from "@/components/dashboard/R2Progress";
import ReleaseCalendarBar from "@/components/dashboard/ReleaseCalendarBar";
import SprintCapacityBar from "@/components/dashboard/SprintCapacityBar";
import { refreshReleaseSprints } from "@/services/release-calendar-sync";
import { fetchProjectVersions } from "@/services/jira-versions";
import { formatReleaseLabel } from "@/lib/release-calendar";
import { fetchBugCycleTimes, type BugCycleTimePeriod } from "@/services/bug-cycle-time";
import PercentilesBars from "@/components/dashboard/PercentilesBars";
import ForecastCards from "@/components/dashboard/ForecastCards";
import EvolutionTable from "@/components/dashboard/EvolutionTable";
import InsightsGrid from "@/components/dashboard/InsightsGrid";
import QualitySpilloverCard from "@/components/dashboard/QualitySpilloverCard";
import PeriodSelector from "@/components/dashboard/PeriodSelector";
import ExportButton from "@/components/dashboard/ExportButton";
import AdminDashboardMenu from "@/components/dashboard/AdminDashboardMenu";
import ThemeToggle from "@/components/ui/ThemeToggle";
import SquadViewTabs from "@/components/dashboard/SquadViewTabs";
import { formatFullDate } from "@/lib/utils";

// Desabilitar cache do Next.js (dados dinâmicos com filtros)
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ squad: string }>;
  searchParams: Promise<{ sprints?: string; months?: string; startDate?: string; endDate?: string; issueType?: string; view?: string }>;
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
  const issueTypeFilter = resolvedSearch.issueType
    ? resolvedSearch.issueType.split(",").filter(Boolean)
    : DEFAULT_ISSUE_TYPES;

  // Detectar modo Design (submenu da Squad na sidebar: ?issueType=Design)
  const isDesignMode = issueTypeFilter.length === 1 && issueTypeFilter[0] === "Design";
  // Computador de Bordo (?view=bordo): sprint vigente em tempo real, só Engenharia
  const isBordo = resolvedSearch.view === "bordo" && !isDesignMode;

  // Buscar dados: S3 raw (com filtros server-side), fallback Jira on-demand
  // Mesma montagem de dados da exportação (PDF): ver src/services/dashboard-data.ts
  let data;
  try {
    data = await loadDashboardData(squad, { sprintIds: requestedSprintIds, months: requestedMonths, issueTypes: issueTypeFilter });
  } catch (error) {
    if (error instanceof DataNotAvailableError) {
      return (
        <main className="min-h-screen p-4 lg:p-6">
          <div className="mx-auto flex flex-col items-center justify-center py-20">
            <div className="rounded-lg border border-[color:var(--ds-color-container-border-alert)] bg-[var(--ds-color-input-surface)] p-8 text-center max-w-md">
              <h2 className="text-lg font-semibold text-[color:var(--ds-color-content-alert)] mb-2">
                Dados não disponíveis
              </h2>
              <p className="text-sm text-[color:var(--ds-color-content-body)]">
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
  // Sprints para o filtro: datas do Jira e release a que pertencem (pelo início da sprint dentro da janela da version)
  const availableSprints = squad.methodology === "sprint"
    ? await (async () => {
        const [sprints, versions] = await Promise.all([
          fetchClosedSprints(squad.boardId, 10).catch(() => []),
          fetchProjectVersions("EP").catch(() => []),
        ]);
        const TOLERANCE_MS = 3 * 86_400_000; // sprint iniciada até 3 dias antes da version (mesma regra do calendário)
        return sprints.map((sp) => {
          const start = new Date(sp.startDate).getTime();
          const rel = versions.find((v) => v.startDate && v.releaseDate &&
            start >= new Date(`${v.startDate}T00:00:00-03:00`).getTime() - TOLERANCE_MS &&
            start <= new Date(`${v.releaseDate}T23:59:59-03:00`).getTime());
          return {
            id: sp.id,
            name: sp.name,
            startDate: sp.startDate,
            endDate: sp.completeDate || sp.endDate,
            releaseLabel: rel ? formatReleaseLabel(rel.name.split(" - ")[0] || rel.name) : undefined,
          };
        });
      })()
    : [];

  // Gerar meses disponíveis (tanto para kanban quanto para sprint squads sem sprints concluídas)
  const availableMonths = generateAvailableMonths(6);

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

  const periodDates = data.periods.length > 0
    ? `Período Apurado: ${formatFullDate(data.periods[0].startDate)} a ${formatFullDate(data.periods[data.periods.length - 1].endDate)}`
    : "";

  const remaining = data.r2Progress.epics.total + data.r2Progress.features.total
    - data.r2Progress.epics.done - data.r2Progress.features.done;

  // Tipos de issue disponíveis (sem Design — Design só via submenu Design da sidebar)
  // Calendário da Release (Visão Geral): estado ATUAL das sprints direto no Jira (início/conclusão feitos entre dois Updates)
  if (!isBordo && data.releaseCalendar && squad.methodology === "sprint") {
    const live = await refreshReleaseSprints(squad, data.releaseCalendar);
    if (live && (live.length > 0 || data.releaseCalendar.sprints.length === 0)) {
      data.releaseCalendar = { ...data.releaseCalendar, sprints: live };
    }
  }
  // Cycle Time de correção de bugs e sub-bugs (Visão Geral; changelogs reais, cache de 1h); falha não derruba o dashboard
  let bugCycleTimes: BugCycleTimePeriod[] = [];
  if (!isBordo) {
    try {
      bugCycleTimes = await fetchBugCycleTimes(data.bugsQuality);
    } catch {
      bugCycleTimes = [];
    }
  }
  const allIssueTypes = ["História", "Bug", "Tech Debt", "Task", "Kaizen", "Spike"];
  const issueTypeParam = issueTypeFilter.length > 0 ? issueTypeFilter.join(",") : undefined;
  // Referência do Computador de Bordo: última sprint fechada
  const lastClosed = data.periodMetrics[data.periodMetrics.length - 1];
  const liveReference = lastClosed
    ? {
        name: lastClosed.period.shortName,
        cycleTimeP85: lastClosed.cycleTime.p85,
        throughput: lastClosed.throughput.total,
        flowEfficiency: lastClosed.flowEfficiency.issues.length > 0 ? Math.round(lastClosed.flowEfficiency.efficiency) : null,
      }
    : undefined;

  return (
    <main className="min-h-screen p-4 lg:p-6">
      <div className="mx-auto">
        {/* Header */}
        <div className="h-1 rounded mb-4" style={{ background: "linear-gradient(to right, var(--accent), var(--ds-color-primary-8))" }} />
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-medium" style={{ color: "var(--text-primary)" }}>
            {squad.name}
          </h1>
          <div className="no-print flex gap-2">
            {session.isAdmin && (
              <AdminDashboardMenu squad={slug} teamSize={displayTeamSize} availableSprints={availableSprints} />
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* Visão da squad + período apurado + filtros (16px do título, padrão entre blocos) */}
        <div className="mt-4">
          <SquadViewTabs squadSlug={slug} active={isDesignMode ? "design" : isBordo ? "bordo" : "overview"} sprints={resolvedSearch.sprints} months={resolvedSearch.months} />
          {!isBordo && <p className="mt-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>{periodDates}</p>}
        </div>
        <div className="mt-3 no-print">
          <PeriodSelector
            methodology={squad.methodology}
            availableSprints={availableSprints}
            currentSprintIds={currentSprintIds}
            availableMonths={availableMonths}
            currentMonths={currentMonths}
            availableIssueTypes={isDesignMode ? [] : allIssueTypes}
            currentIssueTypes={issueTypeFilter}
            showPeriod={!isBordo}
          />
        </div>

        {isBordo ? (
          <>
            {/* Computador de Bordo: tudo da sprint vigente, em tempo real */}
            <div className="mt-5">
              <LiveSprintMetrics squadSlug={slug} issueType={issueTypeParam} reference={liveReference} />
            </div>
            <div className="mt-4">
              <SprintCapacityBar squadSlug={slug} issueType={issueTypeParam} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.wipAging ? (
                <WipAgingChart wipAging={data.wipAging} percentiles={data.percentiles} />
              ) : (
                <div className="theme-section flex items-center justify-center">
                  <p className="text-[11px] t-muted">Nenhum item em andamento no momento.</p>
                </div>
              )}
              <SprintBurndown squadSlug={slug} issueType={issueTypeParam} />
            </div>
          </>
        ) : (
          <>
            {/* Última atualização + alerta de dados históricos */}
            <p className="mt-2 text-[9px]" style={{ color: "var(--text-muted)" }}>
              Última atualização: {new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </p>
            {data.isHistoricalFallback && (
              <div className="mt-2 rounded-md bg-[color-mix(in_srgb,var(--ds-color-content-alert)_12%,transparent)] px-3 py-2 text-[10px] text-[color:var(--ds-color-content-alert)] flex items-center gap-2">
                <span>⚠️</span>
                <span>Alguns dados foram buscados diretamente do Jira (período anterior a 3 meses). Isso pode ter impactado o tempo de carregamento.</span>
              </div>
            )}
            {/* Calendário da Release (sprints da release ativa; estado atual do Jira) */}
            {data.releaseCalendar && (
              <div className="mt-4">
                <ReleaseCalendarBar calendar={data.releaseCalendar} />
              </div>
            )}

            <div className="mt-4">
              <KpiCards kpis={data.kpis} squad={slug} availableSprints={availableSprints} isDesignMode={isDesignMode} />
            </div>

            {/* Design Mode: 3 colunas — cada chart abaixo do seu KPI */}
            {isDesignMode && (
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <CycleTimeChart periodMetrics={data.periodMetrics} stakeholderNote={data.stakeholderNote} />
                <ThroughputDonuts periodMetrics={data.periodMetrics} />
                {data.wipAging ? (
                  <WipAgingChart wipAging={data.wipAging} />
                ) : (
                  <div className="theme-section flex items-center justify-center">
                    <p className="text-[11px] t-muted">Nenhum item Design em andamento</p>
                  </div>
                )}
              </div>
            )}

            {/* Engineering Mode: Visão Geral (sprints fechadas) */}
            {!isDesignMode && (
              <>
                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <CycleTimeChart periodMetrics={data.periodMetrics} stakeholderNote={data.stakeholderNote} />
                  <R2Progress r2Progress={data.r2Progress} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <ThroughputDonuts periodMetrics={data.periodMetrics} />
                  <ThroughputVsCycleTime periodMetrics={data.periodMetrics} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <FlowEfficiencyBars periodMetrics={data.periodMetrics} />
                  <OccupationBars periodMetrics={data.periodMetrics} teamSize={displayTeamSize} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* Esquerda: Confiança de Entrega + Forecast; direita: Transbordo, Qualidade e CT de correção */}
                  <div className="flex flex-col gap-4">
                    <PercentilesBars {...data.percentiles} />
                    <ForecastCards forecast={data.forecast} />
                  </div>
                  <QualitySpilloverCard periodMetrics={data.periodMetrics} bugsQuality={data.bugsQuality} bugCycleTimes={bugCycleTimes} showSpillover={squad.methodology === "sprint"} />
                </div>
                <div className="mt-4">
                  <EvolutionTable evolution={data.evolution} periods={data.periods} />
                </div>
              </>
            )}

            {/* Insights (em Design mode, filtrar insights irrelevantes) */}
            <div className="mt-4">
              <InsightsGrid insights={isDesignMode
                ? data.insights.filter((i) => !i.title.match(/R[23]|Feature|Release|Épico|Eficiência|eficiência|gargalo|Ocupação|ocupação/i))
                : data.insights
              } />
            </div>
          </>
        )}      </div>
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
