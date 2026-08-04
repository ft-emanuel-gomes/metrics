/**
 * DB-backed Kanban adapter.
 * Mirrors kanban-adapter.ts structure but queries all data from the local database
 * instead of calling Jira APIs. Uses time windows (biweekly) instead of sprints,
 * and WIP aging instead of spillover for kanban squads.
 *
 * Requirements: 7.3, 7.4, 4.10
 */

import type { SquadConfig } from "@/config/squads";
import {
  queryCycleTime,
  queryThroughput,
  queryFlowEfficiency,
  queryWipAging,
  queryR2Progress,
  queryForecast,
} from "@/db/metrics";
import { queryOccupationByDateRange } from "@/db/metrics/occupation-db";
import { getSyncStatus } from "@/sync/sync-status";
import { calculateP50, calculateP85, calculateP95 } from "@/metrics/percentile";
import { generateCycleTimeNote } from "@/metrics/cycle-time";
import type {
  DashboardData,
  Period,
  PeriodMetrics,
  KpiSummary,
  KpiItem,
  InsightItem,
  EvolutionRow,
  BurndownPoint,
} from "./types";

/**
 * Error thrown when no synced data is available for a squad.
 */
export class DataNotAvailableError extends Error {
  public readonly squadSlug: string;

  constructor(squadSlug: string) {
    super(`No synced data available for squad "${squadSlug}". Run sync first.`);
    this.name = "DataNotAvailableError";
    this.squadSlug = squadSlug;
  }
}

/**
 * Resolve time windows for Kanban squads.
 * Divides the period into N biweekly windows (default 14 days each).
 */
function resolveKanbanWindows(
  endDate: Date,
  windowCount: number = 3,
  windowDays: number = 14
): Period[] {
  const windows: Period[] = [];

  for (let i = windowCount - 1; i >= 0; i--) {
    const windowEnd = new Date(endDate);
    windowEnd.setDate(windowEnd.getDate() - i * windowDays);

    const windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - windowDays);

    const weekNum = getISOWeek(windowEnd);
    windows.push({
      type: "kanban",
      label: `Semana ${weekNum}`,
      shortName: `Sem${weekNum}`,
      startDate: windowStart.toISOString().split("T")[0],
      endDate: windowEnd.toISOString().split("T")[0],
    });
  }

  return windows;
}

/**
 * DB-backed adapter for squads with Kanban methodology.
 * Uses time windows (configurable, default biweekly) and WIP aging instead of spillover.
 * All data is read from the local database — no Jira API calls.
 */
export async function fetchKanbanDashboardFromDb(
  squad: SquadConfig,
  options?: { windowCount?: number; windowDays?: number }
): Promise<DashboardData> {
  // 0. Verify sync data availability
  const status = await getSyncStatus(squad.slug);
  if (!status || status.lastSyncStatus === "pending") {
    throw new DataNotAvailableError(squad.slug);
  }

  const windowCount = options?.windowCount ?? 3;
  const windowDays = options?.windowDays ?? 14;

  // 1. Resolve time windows
  const endDate = new Date();
  const periods = resolveKanbanWindows(endDate, windowCount, windowDays);

  // 2. For each window, query metrics from DB
  const periodMetrics: PeriodMetrics[] = [];
  const allCycleTimes: number[] = [];

  for (const period of periods) {
    // Cycle Time P85 — pass null for sprintId (kanban mode)
    const cycleTime = await queryCycleTime(
      squad.project,
      null,
      period.startDate,
      period.endDate
    );
    if (cycleTime.issues.length > 0) {
      allCycleTimes.push(...cycleTime.issues.map((i) => i.days));
    }

    // Throughput — pass null for sprintId (kanban mode, uses date range)
    const throughput = await queryThroughput(
      squad.project,
      null,
      period.startDate,
      period.endDate
    );

    // Flow Efficiency — pass null for sprintId
    const flowEfficiency = await queryFlowEfficiency(
      squad.project,
      null,
      period.startDate,
      period.endDate
    );

    // Occupation — query subtasks by date range (no sprint for kanban)
    const occupation = await queryOccupationByDateRange(
      squad.project,
      squad.teamSize,
      period.startDate,
      period.endDate
    );

    periodMetrics.push({
      period,
      cycleTime,
      throughput,
      flowEfficiency,
      // Kanban does NOT have spillover
      occupation,
    });
  }

  // 3. WIP Aging (replaces spillover for Kanban)
  const wipAging = await queryWipAging(squad.project);

  // 4. R2 Progress from DB
  const fixVersion = squad.r2FixVersion;
  const releaseDeadline = "2026-07-31"; // Default deadline, can be made configurable
  const releaseName = fixVersion.split(" - ")[0] || "Release";
  const r2Progress = await queryR2Progress(
    fixVersion,
    squad.teamFieldValue,
    releaseDeadline,
    releaseName
  );

  // 5. Percentiles (combined from all windows)
  const percentiles = {
    p50: calculateP50(allCycleTimes),
    p85: calculateP85(allCycleTimes),
    p95: calculateP95(allCycleTimes),
    sampleSize: allCycleTimes.length,
  };

  // 6. Forecast from DB
  const forecastBase = await queryForecast(fixVersion, squad.teamFieldValue);

  // Story forecast: use the combined P85 from delivery confidence (same as Jira adapter)
  const forecast = {
    ...forecastBase,
    story: { type: "História", p85Days: percentiles.p85, sampleSize: percentiles.sampleSize },
  };

  // 7. KPIs
  const kpis = buildKanbanKpis(periodMetrics, wipAging);

  // 8. Stakeholder note
  const lastPeriod = periodMetrics[periodMetrics.length - 1];
  const stakeholderNote =
    lastPeriod?.cycleTime.p85
      ? generateCycleTimeNote(lastPeriod.cycleTime.issues, lastPeriod.cycleTime.p85)
      : undefined;

  // 9. Evolution table
  const evolution = buildKanbanEvolution(periodMetrics, wipAging);

  // 10. Burndown R2
  const burndown = buildBurndown(periodMetrics, r2Progress);

  // 11. Insights
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

function generateKanbanInsights(
  periodMetrics: PeriodMetrics[],
  wipAging: { totalWip: number; buckets: { label: string; count: number; percentage: number; minDays: number }[] },
  r2Progress: { features: { total: number; done: number } }
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

  // R2 risco
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

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
