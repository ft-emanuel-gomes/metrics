import type { SquadConfig } from "@/config/squads";
import {
  fetchCompletedIssuesWithChangelogs,
  fetchStandardIssuesWithEstimates,
  fetchSubtasksWithParent,
  fetchWipIssues,
  fetchR2Epics,
  fetchR2Features,
} from "@/services/jira-search";
import { fetchChangelogsBatch } from "@/services/jira-changelog";
import { fetchProjectVersions, findActiveRelease } from "@/services/jira-versions";
import { calculateCycleTimeP85, generateCycleTimeNote } from "@/metrics/cycle-time";
import { calculateThroughput } from "@/metrics/throughput";
import { calculatePeriodFlowEfficiency } from "@/metrics/flow-efficiency";
import { calculateWipAging } from "@/metrics/wip-aging";
import { calculateOccupation } from "@/metrics/occupation";
import { calculateR2Progress } from "@/metrics/r2-progress";
import { calculateForecast } from "@/metrics/forecast";
import { calculateP50, calculateP85, calculateP95 } from "@/metrics/percentile";
import type {
  DashboardData,
  Period,
  PeriodMetrics,
  KpiSummary,
  KpiItem,
  InsightItem,
  EvolutionRow,
  BurndownPoint,
  R1vsR2Row,
} from "./types";

/**
 * Gera períodos mensais para squads Kanban.
 * Cada período é um mês completo (01 até último dia),
 * exceto o mês corrente que vai de 01 até hoje.
 */
function resolveMonthlyPeriods(
  referenceDate: Date = new Date(),
  monthCount: number = 3
): Period[] {
  const periods: Period[] = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed

    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;

    let endDate: string;
    if (i === 0) {
      // Mês corrente: usar a data de referência (hoje)
      endDate = referenceDate.toISOString().split("T")[0];
    } else {
      // Mês fechado: último dia do mês
      const lastDay = new Date(year, month + 1, 0).getDate();
      endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const monthFull = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const shortYear = String(year).slice(2);

    periods.push({
      type: "kanban",
      label: `${monthFull[month]}/${shortYear}`,
      shortName: `${monthNames[month]}/${shortYear}`,
      startDate,
      endDate,
    });
  }

  return periods;
}

/**
 * Gera períodos mensais a partir de uma lista de meses selecionados.
 * @param months Array de strings no formato "YYYY-MM" (ex: ["2026-05", "2026-06", "2026-07"])
 */
function resolveSelectedMonths(months: string[]): Period[] {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const monthFull = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return months.sort().map((m) => {
    const [yearStr, monthStr] = m.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr) - 1; // 0-indexed

    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const fullEndDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Se o mês ainda não fechou, usar hoje como endDate
    const endDate = fullEndDate > todayStr ? todayStr : fullEndDate;
    const shortYear = String(year).slice(2);

    return {
      type: "kanban" as const,
      label: `${monthFull[month]}/${shortYear}`,
      shortName: `${monthNames[month]}/${shortYear}`,
      startDate,
      endDate,
    };
  });
}

/**
 * Adapter para squads com metodologia Kanban.
 * Similar ao sprint-adapter, mas sem conceito de sprint/transbordo.
 * Usa períodos mensais e WIP Aging no lugar de transbordo.
 */
export async function fetchKanbanDashboard(
  squad: SquadConfig,
  selectedMonths?: string[],
  _unused?: string,
  issueTypeFilter?: string[]
): Promise<DashboardData> {
  // 1. Resolver períodos mensais
  const periods = selectedMonths && selectedMonths.length > 0
    ? resolveSelectedMonths(selectedMonths)
    : resolveMonthlyPeriods(new Date(), 3);

  // 2. Para cada janela, buscar dados e calcular métricas
  const periodMetrics: PeriodMetrics[] = [];
  const allCycleTimes: number[] = [];

  for (const period of periods) {
    // OTIMIZADO: Buscar issues COM changelogs inline
    let completedWithCL = await fetchCompletedIssuesWithChangelogs(
      squad.project,
      null,
      period.startDate,
      period.endDate
    );

    // Aplicar filtro por issue type (se ativo)
    if (issueTypeFilter && issueTypeFilter.length > 0) {
      completedWithCL = completedWithCL.filter((i) =>
        issueTypeFilter.includes(i.issueType) || issueTypeFilter.includes(i.issueType === "Story" ? "História" : i.issueType)
      );
    }

    const issuesWithChangelogs = completedWithCL.map((issue) => ({
      key: issue.key,
      transitions: issue.transitions,
    }));

    // Cycle Time P85
    const cycleTime = calculateCycleTimeP85(issuesWithChangelogs);
    if (cycleTime.issues.length > 0) {
      allCycleTimes.push(...cycleTime.issues.map((i) => i.days));
    }

    // Vazão
    const throughput = calculateThroughput(completedWithCL);

    // Eficiência de Fluxo (Design usa regra diferente: apenas In Progress = ativo)
    const isDesignMode = issueTypeFilter?.length === 1 && issueTypeFilter[0] === "Design";
    const flowEfficiency = calculatePeriodFlowEfficiency(issuesWithChangelogs, isDesignMode);

    // Ocupação (regra: max entre soma subtasks filhas vs estimate da Standard Issue)
    let standardEstimates = await fetchStandardIssuesWithEstimates(
      squad.project, null, period.startDate, period.endDate
    );
    let subtasksForOccupation = await fetchSubtasksWithParent(
      squad.project, null, period.startDate, period.endDate
    );
    // Aplicar filtro por issue type na ocupação (se ativo)
    if (issueTypeFilter && issueTypeFilter.length > 0) {
      standardEstimates = standardEstimates.filter((s) =>
        s.issueType && (issueTypeFilter.includes(s.issueType) || issueTypeFilter.includes(s.issueType === "Story" ? "História" : s.issueType))
      );
      subtasksForOccupation = subtasksForOccupation.filter((s) => {
        if (!s.parentKey) return true;
        return standardEstimates.some((std) => std.key === s.parentKey);
      });
    }
    const occupation = calculateOccupation(
      standardEstimates,
      subtasksForOccupation,
      squad.teamSize,
      period.startDate,
      period.endDate
    );

    periodMetrics.push({
      period,
      cycleTime,
      throughput,
      flowEfficiency,
      // Kanban NÃO tem spillover
      occupation,
    });
  }

  // 3. WIP Aging (substitui transbordo para Kanban, filtrado por issueType)
  let wipIssues = await fetchWipIssues(squad.project);
  // Aplicar filtro por issue type no WIP (excluir Design quando não solicitado)
  if (issueTypeFilter && issueTypeFilter.length > 0) {
    wipIssues = wipIssues.filter((i) =>
      issueTypeFilter.includes(i.issueType) || issueTypeFilter.includes(i.issueType === "Story" ? "História" : i.issueType)
    );
  }
  const wipKeys = wipIssues.map((i) => i.key);
  const wipChangelogs = await fetchChangelogsBatch(wipKeys);
  const wipWithChangelogs = wipIssues.map((i) => ({
    key: i.key,
    summary: i.summary,
    status: i.status,
    transitions: wipChangelogs.get(i.key) || [],
  }));
  const wipAging = calculateWipAging(wipWithChangelogs);

  // 4. Progresso da Release ativa (dinâmico)
  const projectVersions = await fetchProjectVersions("EP");
  const activeRelease = findActiveRelease(projectVersions);
  const activeFixVersion = activeRelease?.name || squad.r2FixVersion;
  const releaseDeadline = activeRelease?.releaseDate || "2026-07-31";

  const [r2Epics, r2Features] = await Promise.all([
    fetchR2Epics(activeFixVersion, squad.teamFieldValue),
    fetchR2Features(activeFixVersion, squad.teamFieldValue),
  ]);
  const r2Progress = calculateR2Progress(r2Epics, r2Features, releaseDeadline, activeRelease?.name.split(" - ")[0] || "Release");

  // 5. Percentis combinados
  const percentiles = {
    p50: calculateP50(allCycleTimes),
    p85: calculateP85(allCycleTimes),
    p95: calculateP95(allCycleTimes),
    sampleSize: allCycleTimes.length,
  };

  // 6. Forecast (Épicos e Features R2 + Histórias = média CT P85 das janelas)
  const allR2Items = [...r2Epics, ...r2Features];
  const r2Keys = allR2Items.map((i) => i.key);
  const r2Changelogs = await fetchChangelogsBatch(r2Keys);
  const r2WithChangelogs = allR2Items.map((i) => ({
    key: i.key,
    issueType: i.issueType,
    status: i.status,
    transitions: r2Changelogs.get(i.key) || [],
  }));

  const forecastBase = calculateForecast(r2WithChangelogs);

  // História: usar o MESMO P85 da Confiança de Entrega (percentis combinados)
  const forecast = {
    ...forecastBase,
    story: { type: "História", p85Days: percentiles.p85, sampleSize: percentiles.sampleSize },
  };

  // 7. KPIs
  const kpis = buildKanbanKpis(periodMetrics, wipAging);

  // 8. Nota stakeholders
  const lastPeriod = periodMetrics[periodMetrics.length - 1];
  const stakeholderNote =
    lastPeriod?.cycleTime.p85
      ? generateCycleTimeNote(lastPeriod.cycleTime.issues, lastPeriod.cycleTime.p85)
      : undefined;

  // 9. Tabela evolução
  const evolution = buildKanbanEvolution(periodMetrics, wipAging);

  // 10. Burndown R2
  const burndown = buildBurndown(periodMetrics, r2Progress);

  // 11. (R1 vs R2 removido)

  // 12. Insights
  const insights = generateKanbanInsights(periodMetrics, wipAging, r2Progress);

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
    bugsQuality: [],
  };
}

// --- Helpers ---

function buildKanbanKpis(
  periodMetrics: PeriodMetrics[],
  wipAging: { totalWip: number; buckets: { label: string; minDays: number; count: number; percentage: number }[] }
): KpiSummary {
  const current = periodMetrics[periodMetrics.length - 1];
  const previous = periodMetrics.length > 1 ? periodMetrics[periodMetrics.length - 2] : null;

  // WIP Aging KPI: % de itens com > 10 dias
  const criticalWip = wipAging.buckets
    .filter((b) => b.minDays >= 15)
    .reduce((sum, b) => sum + b.count, 0);
  const criticalPct = wipAging.totalWip > 0
    ? Math.round((criticalWip / wipAging.totalWip) * 100)
    : 0;

  return {
    cycleTime: buildKpiItem(
      "Cycle Time P85",
      current?.cycleTime.p85 ?? 0,
      previous?.cycleTime.p85 ?? 0,
      "d",
      previous?.period.shortName ?? "",
      "lower"
    ),
    throughput: buildKpiItem(
      "Vazão",
      current?.throughput.total ?? 0,
      previous?.throughput.total ?? 0,
      "",
      previous?.period.shortName ?? "",
      "higher"
    ),
    flowEfficiency: buildKpiItem(
      "Eficiência de Fluxo",
      current?.flowEfficiency.efficiency ?? 0,
      previous?.flowEfficiency.efficiency ?? 0,
      "%",
      previous?.period.shortName ?? "",
      "higher"
    ),
    spilloverOrWip: {
      label: "WIP Aging (>10d)",
      value: `${criticalPct}%`,
      numericValue: criticalPct,
      status: criticalPct > 50 ? "danger" : criticalPct > 30 ? "warn" : "good",
      delta: `${criticalWip}/${wipAging.totalWip} itens`,
      deltaDirection: criticalPct > 50 ? "up" : "flat",
      previousValue: `Total WIP: ${wipAging.totalWip}`,
    },
    occupation: buildKpiItem(
      "Ocupação",
      current?.occupation.percentage ?? 0,
      previous?.occupation.percentage ?? 0,
      "%",
      previous?.period.shortName ?? "",
      "info"
    ),
    wipAging: {
      label: "WIP Aging (>10d)",
      value: `${criticalPct}%`,
      numericValue: criticalPct,
      status: criticalPct > 50 ? "danger" : criticalPct > 30 ? "warn" : "good",
      delta: `${criticalWip}/${wipAging.totalWip} itens`,
      deltaDirection: criticalPct > 50 ? "up" : "flat",
      previousValue: `Total WIP: ${wipAging.totalWip}`,
    },
  };
}

function buildKpiItem(
  label: string,
  currentValue: number,
  previousValue: number,
  unit: string,
  previousLabel: string,
  preference: "higher" | "lower" | "info"
): KpiItem {
  const delta = currentValue - previousValue;
  const deltaSign = delta > 0 ? "+" : "";
  const deltaUnit = unit === "%" ? "pp" : unit;

  let status: KpiItem["status"];
  let deltaDirection: KpiItem["deltaDirection"];

  if (delta === 0) {
    deltaDirection = "flat";
    status = "info";
  } else if (preference === "info") {
    deltaDirection = delta > 0 ? "up" : "down";
    status = "info";
  } else if (preference === "higher") {
    deltaDirection = delta > 0 ? "up" : "down";
    status = delta > 0 ? "good" : "danger";
  } else {
    deltaDirection = delta > 0 ? "up" : "down";
    status = delta < 0 ? "good" : "danger";
  }

  if (status === "danger" && Math.abs(delta) < Math.max(currentValue * 0.1, 1)) {
    status = "warn";
  }

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

function buildKanbanEvolution(
  periodMetrics: PeriodMetrics[],
  wipAging: { totalWip: number; buckets: { label: string; count: number; percentage: number }[] }
): EvolutionRow[] {
  return [
    {
      metric: "CT P85",
      values: periodMetrics.map((p) => `${p.cycleTime.p85 ?? "N/A"}d`),
      ...detectTrend(periodMetrics.map((p) => p.cycleTime.p85 ?? 0), "lower"),
    },
    {
      metric: "Vazão",
      values: periodMetrics.map((p) => `${p.throughput.total}`),
      ...detectTrend(periodMetrics.map((p) => p.throughput.total), "higher"),
    },
    {
      metric: "Eficiência",
      values: periodMetrics.map((p) => `${p.flowEfficiency.efficiency}%`),
      ...detectTrend(periodMetrics.map((p) => p.flowEfficiency.efficiency), "higher"),
    },
    {
      metric: "WIP Total",
      values: [`${wipAging.totalWip}`],
      trend: "estavel",
      trendColor: "flat",
    },
    {
      metric: "Ocupação",
      values: periodMetrics.map((p) => `${p.occupation.percentage}%`),
      ...detectTrend(periodMetrics.map((p) => p.occupation.percentage), "neutral"),
    },
  ];
}

function detectTrend(
  values: number[],
  preference: "higher" | "lower" | "neutral"
): { trend: EvolutionRow["trend"]; trendColor: EvolutionRow["trendColor"] } {
  if (values.length < 2) return { trend: "estavel", trendColor: "flat" };
  const first = values[0];
  const last = values[values.length - 1];
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

function buildBurndown(
  periodMetrics: PeriodMetrics[],
  r2Progress: { epics: { total: number; done: number }; features: { total: number; done: number } }
): BurndownPoint[] {
  const totalItems = r2Progress.epics.total + r2Progress.features.total;
  const remaining = totalItems - r2Progress.epics.done - r2Progress.features.done;

  return periodMetrics.map((pm, idx) => ({
    period: pm.period,
    idealRemaining: Math.max(0, totalItems - Math.round((totalItems / periodMetrics.length) * (idx + 1))),
    realRemaining: Math.max(0, remaining + (periodMetrics.length - 1 - idx)),
  }));
}

function buildR1vsR2(periodMetrics: PeriodMetrics[]): R1vsR2Row[] {
  if (periodMetrics.length < 2) return [];
  const first = periodMetrics[0];
  const last = periodMetrics[periodMetrics.length - 1];

  return [
    buildRow("CT P85", first.cycleTime.p85 ?? 0, last.cycleTime.p85 ?? 0, "d", "lower"),
    buildRow("Vazão", first.throughput.total, last.throughput.total, "", "higher"),
    buildRow("Eficiência", first.flowEfficiency.efficiency, last.flowEfficiency.efficiency, "%", "higher"),
  ];
}

function buildRow(name: string, v1: number, v2: number, unit: string, pref: "higher" | "lower"): R1vsR2Row {
  const diff = v2 - v1;
  const sign = diff > 0 ? "+" : "";
  const variation = unit === "%" ? `${sign}${diff}pp` : `${sign}${diff}${unit}`;
  return {
    name,
    r1Value: `${v1}${unit}`,
    r2Value: `${v2}${unit}`,
    variation,
    trend: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
    isPositive: pref === "higher" ? diff > 0 : diff < 0,
  };
}

function generateKanbanInsights(
  periodMetrics: PeriodMetrics[],
  wipAging: { totalWip: number; buckets: { label: string; count: number; percentage: number; minDays: number }[] },
  r2Progress: { features: { total: number; done: number }; releaseName: string }
): InsightItem[] {
  const insights: InsightItem[] = [];
  const current = periodMetrics[periodMetrics.length - 1];

  // WIP Aging crítico
  const criticalBuckets = wipAging.buckets.filter((b) => b.minDays >= 15);
  const criticalCount = criticalBuckets.reduce((s, b) => s + b.count, 0);
  if (criticalCount > wipAging.totalWip * 0.4) {
    insights.push({
      title: "WIP com aging crítico",
      text: `${criticalCount} de ${wipAging.totalWip} itens em andamento estão há mais de 10 dias. Priorizar conclusão e limitar entrada de novos itens.`,
      severity: "red",
    });
  }

  // Eficiência baixa
  if (current && current.flowEfficiency.efficiency < 50) {
    insights.push({
      title: "Eficiência de fluxo abaixo da meta",
      text: `Eficiência em ${current.flowEfficiency.efficiency}% (meta: 70%). Cards passam mais tempo em filas do que sendo trabalhados.`,
      severity: "yellow",
    });
  }

  // Release risco
  if (r2Progress.features.total > 0 && r2Progress.features.done / r2Progress.features.total < 0.5) {
    insights.push({
      title: `${r2Progress.releaseName} exige aceleração`,
      text: `Apenas ${r2Progress.features.done} de ${r2Progress.features.total} Features concluídas. Ritmo precisa aumentar.`,
      severity: "blue",
    });
  }

  // Vazão positiva
  const throughputs = periodMetrics.map((p) => p.throughput.total);
  if (throughputs.length >= 2 && throughputs[throughputs.length - 1] >= throughputs[0]) {
    insights.push({
      title: "Vazão em tendência positiva",
      text: `Vazão mantida ou crescente entre as últimas janelas. Capacidade de entrega previsível.`,
      severity: "green",
    });
  }

  return insights.slice(0, 4);
}

// (getISOWeek removed — no longer needed with monthly periods)
