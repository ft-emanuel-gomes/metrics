/**
 * Metrics-from-raw — recalcula todas as métricas do dashboard
 * a partir dos dados brutos armazenados no S3, aplicando filtros server-side.
 *
 * Isso permite servir qualquer combinação de filtros (sprint, issueType)
 * sem precisar bater no Jira novamente.
 */

import type { SquadConfig } from "@/config/squads";
import type { RawPeriodData, RawWipData, RawR2Data } from "./s3-raw-storage";
import type { JiraIssueWithChangelog, JiraIssue } from "./jira-search";
import { calculateCycleTimeP85, generateCycleTimeNote } from "@/metrics/cycle-time";
import { calculateThroughput } from "@/metrics/throughput";
import { calculatePeriodFlowEfficiency } from "@/metrics/flow-efficiency";
import { calculateSpillover } from "@/metrics/spillover";
import { calculateOccupation } from "@/metrics/occupation";
import { calculateR2Progress } from "@/metrics/r2-progress";
import { calculateForecast } from "@/metrics/forecast";
import { calculateWipAging } from "@/metrics/wip-aging";
import { calculateP50, calculateP85, calculateP95 } from "@/metrics/percentile";
import { getSprintCapacity, getSprintBusinessDays } from "./capacity-store";
import type {
  DashboardData,
  Period,
  PeriodMetrics,
  KpiSummary,
  KpiItem,
  InsightItem,
  EvolutionRow,
  BurndownPoint,
  BugQualityData,
} from "@/adapters/types";

// --- Normalização de tipo (mesma lógica do sprint-adapter) ---

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

function matchesFilter(issueType: string, filter: string[]): boolean {
  return filter.includes(issueType) || filter.includes(normalizeType(issueType));
}

// --- Main Function ---

/**
 * Reconstrói o DashboardData completo a partir dos dados brutos do S3.
 * Aplica filtros de issueType server-side.
 */
export function buildDashboardFromRaw(
  squad: SquadConfig,
  periodsRaw: RawPeriodData[],
  wipRaw: RawWipData | null,
  r2Raw: RawR2Data | null,
  issueTypeFilter?: string[]
): DashboardData {
  // Ordenar períodos cronologicamente (garante KPIs current/previous corretos)
  periodsRaw.sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));

  const periodMetrics: PeriodMetrics[] = [];
  const allCycleTimes: number[] = [];
  const bugsQuality: BugQualityData[] = [];

  for (const raw of periodsRaw) {
    // Aplicar filtro de issueType nas issues concluídas
    let completedIssues: JiraIssueWithChangelog[] = raw.completedIssues;
    if (issueTypeFilter && issueTypeFilter.length > 0) {
      completedIssues = completedIssues.filter((i) => matchesFilter(i.issueType, issueTypeFilter));
    }

    // Montar changelogs para cálculos
    const issuesWithChangelogs = completedIssues.map((issue) => ({
      key: issue.key,
      transitions: issue.transitions,
    }));

    // Cycle Time P85
    const cycleTime = calculateCycleTimeP85(issuesWithChangelogs);
    if (cycleTime.issues.length > 0) {
      allCycleTimes.push(...cycleTime.issues.map((i) => i.days));
    }

    // Vazão
    const throughput = calculateThroughput(completedIssues as JiraIssue[]);

    // Eficiência de Fluxo (Design usa regra diferente: apenas In Progress = ativo)
    const isDesignMode = issueTypeFilter?.length === 1 && issueTypeFilter[0] === "Design";
    const flowEfficiency = calculatePeriodFlowEfficiency(issuesWithChangelogs, isDesignMode);

    // Transbordo (sprint only)
    let spillover;
    if (raw.spilledIssues) {
      spillover = calculateSpillover(raw.spilledIssues, completedIssues as JiraIssue[]);
    }

    // Ocupação
    let estimates = raw.standardEstimates;
    let subtasksForOccupation = raw.subtasksWithParent || [];
    if (issueTypeFilter && issueTypeFilter.length > 0) {
      estimates = estimates.filter((s) => s.issueType && matchesFilter(s.issueType, issueTypeFilter));
      subtasksForOccupation = subtasksForOccupation.filter((s) => {
        if (!s.parentKey) return true;
        return estimates.some((std) => std.key === s.parentKey);
      });
    }
    const sprintId = raw.period.id;
    const teamSize = sprintId
      ? getSprintCapacity(squad.slug, sprintId, squad.teamSize)
      : squad.teamSize;
    const customBusinessDays = sprintId
      ? getSprintBusinessDays(squad.slug, sprintId)
      : undefined;
    const occupation = calculateOccupation(
      estimates,
      subtasksForOccupation,
      teamSize,
      raw.period.startDate,
      raw.period.endDate,
      6,
      customBusinessDays
    );

    // Bugs (não filtra por issueType — sempre mostra qualidade)
    bugsQuality.push({
      period: raw.period.shortName,
      bugs: raw.bugs.length,
      subBugs: raw.subBugs.length,
      bugKeys: raw.bugs.map((b) => b.key),
      subBugKeys: raw.subBugs.map((b) => b.key),
    });

    periodMetrics.push({
      period: raw.period as Period,
      cycleTime,
      throughput,
      flowEfficiency,
      spillover,
      occupation,
    });
  }

  // WIP Aging (filtrar por issueType — excluir Design quando não solicitado)
  let wipFiltered = wipRaw ? wipRaw.issues : [];
  if (wipRaw && issueTypeFilter && issueTypeFilter.length > 0) {
    wipFiltered = wipRaw.issues.filter((i) => {
      // Se issueType não está salvo no raw (dados antigos), inferir pelo key prefix ou excluir Design por nome
      const type = i.issueType || "";
      if (!type) {
        // Dados antigos: não tem issueType — aceitar se não estamos pedindo Design exclusively
        // Se o filtro inclui Design E é o único tipo, rejeitar items sem tipo (são provavelmente Eng)
        const isDesignOnly = issueTypeFilter.length === 1 && issueTypeFilter[0] === "Design";
        return !isDesignOnly;
      }
      return matchesFilter(type, issueTypeFilter);
    });
  }
  const wipAging = wipFiltered.length > 0
    ? calculateWipAging(wipFiltered)
    : undefined;

  // R2 Progress
  const r2Progress = r2Raw
    ? calculateR2Progress(r2Raw.epics, r2Raw.features, r2Raw.releaseDeadline, r2Raw.releaseName)
    : { epics: { total: 0, done: 0, inProgress: 0, pending: 0 }, features: { total: 0, done: 0, inProgress: 0, pending: 0 }, releaseName: "Release", deadline: "2026-12-31" };

  // Percentis
  const percentiles = {
    p50: calculateP50(allCycleTimes),
    p85: calculateP85(allCycleTimes),
    p95: calculateP95(allCycleTimes),
    sampleSize: allCycleTimes.length,
  };

  // Forecast
  const forecast = r2Raw
    ? (() => {
        const base = calculateForecast(r2Raw.r2WithChangelogs);
        return { ...base, story: { type: "História", p85Days: percentiles.p85, sampleSize: percentiles.sampleSize } };
      })()
    : { epic: { type: "Épico", p85Days: null, sampleSize: 0 }, feature: { type: "Feature", p85Days: null, sampleSize: 0 }, story: { type: "História", p85Days: percentiles.p85, sampleSize: percentiles.sampleSize } };

  // KPIs
  const kpis = buildKpis(periodMetrics, wipAging, squad.methodology);

  // Nota stakeholders
  const lastPeriod = periodMetrics[periodMetrics.length - 1];
  const stakeholderNote = lastPeriod?.cycleTime.p85
    ? generateCycleTimeNote(lastPeriod.cycleTime.issues, lastPeriod.cycleTime.p85)
    : undefined;

  // Evolução
  const evolution = buildEvolution(periodMetrics, squad.methodology);

  // Burndown
  const burndown = buildBurndown(periodMetrics, r2Progress);

  // Insights
  const insights = generateInsights(periodMetrics, r2Progress, wipAging);

  // Periods — ordenar cronologicamente por startDate
  const periods = periodsRaw.map((r) => r.period as Period)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return {
    squad,
    periods,
    generatedAt: new Date().toISOString(),
    kpis,
    periodMetrics,
    wipAging,
    r2Progress,
    percentiles,
    forecast,
    burndown,
    evolution,
    insights,
    stakeholderNote,
    bugsQuality,
  };
}

// --- KPI Builder ---

function buildKpis(
  periodMetrics: PeriodMetrics[],
  wipAging: { totalWip: number; buckets: { label: string; minDays: number; count: number; percentage: number }[] } | undefined,
  methodology: "sprint" | "kanban"
): KpiSummary {
  const current = periodMetrics[periodMetrics.length - 1];
  const previous = periodMetrics.length > 1 ? periodMetrics[periodMetrics.length - 2] : null;

  const criticalWip = wipAging
    ? wipAging.buckets.filter((b) => b.minDays >= 15).reduce((sum, b) => sum + b.count, 0)
    : 0;
  const criticalPct = wipAging && wipAging.totalWip > 0
    ? Math.round((criticalWip / wipAging.totalWip) * 100)
    : 0;

  const spilloverOrWip: KpiItem = methodology === "sprint"
    ? buildKpiItem("Transbordo", current?.spillover?.percentage ?? 0, previous?.spillover?.percentage ?? 0, "%", previous?.period.shortName ?? "", "lower")
    : {
        label: "WIP Aging (>10d)",
        value: `${criticalPct}%`,
        numericValue: criticalPct,
        status: criticalPct > 50 ? "danger" : criticalPct > 30 ? "warn" : "good",
        delta: `${criticalWip}/${wipAging?.totalWip ?? 0} itens`,
        deltaDirection: criticalPct > 50 ? "up" : "flat",
        previousValue: `Total WIP: ${wipAging?.totalWip ?? 0}`,
      };

  return {
    cycleTime: buildKpiItem("Cycle Time P85", current?.cycleTime.p85 ?? 0, previous?.cycleTime.p85 ?? 0, "d", previous?.period.shortName ?? "", "lower"),
    throughput: buildKpiItem("Vazão", current?.throughput.total ?? 0, previous?.throughput.total ?? 0, "", previous?.period.shortName ?? "", "higher"),
    flowEfficiency: buildKpiItem("Eficiência de Fluxo", current?.flowEfficiency.efficiency ?? 0, previous?.flowEfficiency.efficiency ?? 0, "%", previous?.period.shortName ?? "", "higher"),
    spilloverOrWip,
    occupation: buildKpiItem("Ocupação", current?.occupation.percentage ?? 0, previous?.occupation.percentage ?? 0, "%", previous?.period.shortName ?? "", "info"),
    wipAging: wipAging ? {
      label: "WIP Aging (>10d)",
      value: `${criticalPct}%`,
      numericValue: criticalPct,
      status: criticalPct > 50 ? "danger" : criticalPct > 30 ? "warn" : "good",
      delta: `${criticalWip}/${wipAging.totalWip} itens`,
      deltaDirection: criticalPct > 50 ? "up" : "flat",
      previousValue: `Total WIP: ${wipAging.totalWip}`,
    } : undefined,
  };
}

function buildKpiItem(label: string, currentValue: number, previousValue: number, unit: string, previousLabel: string, preference: "higher" | "lower" | "info"): KpiItem {
  const delta = currentValue - previousValue;
  const deltaSign = delta > 0 ? "+" : "";
  const deltaUnit = unit === "%" ? "pp" : unit;

  let status: KpiItem["status"];
  let deltaDirection: KpiItem["deltaDirection"];

  if (delta === 0) { deltaDirection = "flat"; status = "info"; }
  else if (preference === "info") { deltaDirection = delta > 0 ? "up" : "down"; status = "info"; }
  else if (preference === "higher") { deltaDirection = delta > 0 ? "up" : "down"; status = delta > 0 ? "good" : "danger"; }
  else { deltaDirection = delta > 0 ? "up" : "down"; status = delta < 0 ? "good" : "danger"; }

  if (status === "danger" && Math.abs(delta) < Math.max(currentValue * 0.1, 1)) status = "warn";

  return {
    label,
    value: `${currentValue}${unit}`,
    numericValue: currentValue,
    status,
    delta: previousLabel ? `${deltaSign}${delta}${deltaUnit} vs ${previousLabel}` : "",
    deltaDirection,
    previousValue: previousLabel ? `${previousLabel}: ${previousValue}${unit}` : "",
  };
}

// --- Evolution ---

function buildEvolution(periodMetrics: PeriodMetrics[], methodology: "sprint" | "kanban"): EvolutionRow[] {
  const rows: EvolutionRow[] = [
    { metric: "CT P85", values: periodMetrics.map((p) => `${p.cycleTime.p85 ?? "N/A"}d`), ...detectTrend(periodMetrics.map((p) => p.cycleTime.p85 ?? 0), "lower") },
    { metric: "Vazão", values: periodMetrics.map((p) => `${p.throughput.total}`), ...detectTrend(periodMetrics.map((p) => p.throughput.total), "higher") },
    { metric: "Eficiência", values: periodMetrics.map((p) => `${p.flowEfficiency.efficiency}%`), ...detectTrend(periodMetrics.map((p) => p.flowEfficiency.efficiency), "higher") },
  ];
  if (methodology === "sprint") {
    rows.push({ metric: "Transbordo", values: periodMetrics.map((p) => `${p.spillover?.percentage ?? 0}%`), ...detectTrend(periodMetrics.map((p) => p.spillover?.percentage ?? 0), "lower") });
  }
  rows.push({ metric: "Ocupação", values: periodMetrics.map((p) => `${p.occupation.percentage}%`), ...detectTrend(periodMetrics.map((p) => p.occupation.percentage), "neutral") });
  return rows;
}

function detectTrend(values: number[], preference: "higher" | "lower" | "neutral"): { trend: EvolutionRow["trend"]; trendColor: EvolutionRow["trendColor"] } {
  if (values.length < 2) return { trend: "estavel", trendColor: "flat" };
  const first = values[0]; const last = values[values.length - 1];
  const diff = last - first;
  const threshold = Math.max(Math.abs(first) * 0.1, 1);
  if (Math.abs(diff) < threshold) return { trend: "estavel", trendColor: "flat" };
  const isGrowing = diff > 0;
  const trend: EvolutionRow["trend"] = isGrowing ? "crescente" : "decrescente";
  let trendColor: EvolutionRow["trendColor"];
  if (preference === "neutral") trendColor = "flat";
  else if (preference === "higher") trendColor = isGrowing ? "up" : "down";
  else trendColor = isGrowing ? "down" : "up";
  return { trend, trendColor };
}

// --- Burndown ---

function buildBurndown(periodMetrics: PeriodMetrics[], r2Progress: { epics: { total: number; done: number }; features: { total: number; done: number } }): BurndownPoint[] {
  const totalItems = r2Progress.epics.total + r2Progress.features.total;
  const remaining = totalItems - r2Progress.epics.done - r2Progress.features.done;
  return periodMetrics.map((pm, idx) => ({
    period: pm.period,
    idealRemaining: Math.max(0, totalItems - Math.round((totalItems / periodMetrics.length) * (idx + 1))),
    realRemaining: Math.max(0, remaining + (periodMetrics.length - 1 - idx)),
  }));
}

// --- Insights ---

function generateInsights(
  periodMetrics: PeriodMetrics[],
  r2Progress: { features: { total: number; done: number } },
  wipAging?: { totalWip: number; buckets: { minDays: number; count: number }[] }
): InsightItem[] {
  const insights: InsightItem[] = [];
  const current = periodMetrics[periodMetrics.length - 1];

  if (wipAging) {
    const critical = wipAging.buckets.filter((b) => b.minDays >= 15).reduce((s, b) => s + b.count, 0);
    if (critical > wipAging.totalWip * 0.4) {
      insights.push({ title: "WIP com aging crítico", text: `${critical} de ${wipAging.totalWip} itens estão há mais de 10 dias. Priorizar conclusão.`, severity: "red" });
    }
  }

  if (current && current.flowEfficiency.efficiency < 50) {
    insights.push({ title: "Eficiência abaixo da meta", text: `Eficiência em ${current.flowEfficiency.efficiency}% (meta: 60%). Cards passam mais tempo em filas.`, severity: "yellow" });
  }

  if (r2Progress.features.total > 0 && r2Progress.features.done / r2Progress.features.total < 0.5) {
    insights.push({ title: `${r2Progress.releaseName} exige aceleração`, text: `Apenas ${r2Progress.features.done} de ${r2Progress.features.total} Features concluídas.`, severity: "blue" });
  }

  const throughputs = periodMetrics.map((p) => p.throughput.total);
  if (throughputs.length >= 2 && throughputs[throughputs.length - 1] >= throughputs[0]) {
    insights.push({ title: "Vazão positiva", text: "Vazão mantida ou crescente. Capacidade de entrega previsível.", severity: "green" });
  }

  return insights.slice(0, 4);
}
