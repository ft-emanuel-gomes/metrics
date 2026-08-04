/**
 * DB-backed adapter para squads com metodologia Sprint.
 * Espelha a estrutura de sprint-adapter.ts mas usa exclusivamente
 * funções de query do banco de dados local (Data_Store).
 *
 * Nenhuma chamada à Jira API é feita neste módulo.
 * Requirements: 7.3, 7.4, 6.5, 4.10
 */

import type { SquadConfig } from "@/config/squads";
import {
  queryCycleTime,
  queryThroughput,
  queryFlowEfficiency,
  querySpillover,
  queryOccupation,
  queryR2Progress,
  queryForecast,
  isDataStale,
} from "@/db/metrics";
import { querySprintsByBoard, type SprintRow } from "@/db/queries/sprints";
import { getSyncStatus } from "@/sync/sync-status";
import { getSprintCapacity } from "@/services/capacity-store";
import { getDatabase } from "@/db/connection";
import { issues, changelogEvents } from "@/db/schema";
import { eq, and, inArray, between } from "drizzle-orm";
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
  BugQualityData,
} from "./types";

// ─── Error Class ──────────────────────────────────────────────────────────────

/**
 * Erro lançado quando nenhum dado sincronizado está disponível para uma squad.
 * O sync precisa completar ao menos uma vez antes de servir métricas via DB.
 */
export class DataNotAvailableError extends Error {
  constructor(squadSlug: string) {
    super(`No synced data available for squad: ${squadSlug}. Sync must complete first.`);
    this.name = "DataNotAvailableError";
  }
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Adapter DB-backed para squads Sprint.
 * Orquestra busca de dados e cálculo de métricas usando exclusivamente o Data_Store.
 * Retorna DashboardData idêntico ao adapter Jira-direto.
 */
export async function fetchSprintDashboardFromDb(
  squad: SquadConfig,
  requestedSprintIds?: number[],
  issueTypeFilter?: string[]
): Promise<DashboardData> {
  // 0. Verificar disponibilidade de dados sincronizados
  const syncStatus = await getSyncStatus(squad.slug);
  if (!syncStatus || syncStatus.lastSyncStatus === "pending") {
    throw new DataNotAvailableError(squad.slug);
  }

  // 1. Buscar sprints concluídas do DB
  let sprintRows = await querySprintsByBoard(squad.boardId, "closed");

  if (requestedSprintIds && requestedSprintIds.length > 0) {
    sprintRows = sprintRows.filter((s) => requestedSprintIds.includes(s.id));
    if (sprintRows.length === 0) {
      // Fallback: últimas 3 sprints concluídas
      const allClosed = await querySprintsByBoard(squad.boardId, "closed");
      sprintRows = allClosed.slice(-3);
    }
  } else {
    // Padrão: últimas 3 sprints concluídas
    sprintRows = sprintRows.slice(-3);
  }

  if (sprintRows.length === 0) {
    throw new DataNotAvailableError(squad.slug);
  }

  const periods = sprintRowsToPeriods(sprintRows);

  // 2. Para cada sprint, calcular métricas a partir do DB
  const periodMetrics: PeriodMetrics[] = [];
  const allCycleTimes: number[] = [];
  const bugsQuality: BugQualityData[] = [];

  for (const sprint of sprintRows) {
    const startDate = sprint.startDate.toISOString();
    const endDate = sprint.endDate.toISOString();

    // Cycle Time P85
    const cycleTime = await queryCycleTime(
      squad.project,
      sprint.id,
      startDate,
      endDate
    );
    if (cycleTime.issues.length > 0) {
      allCycleTimes.push(...cycleTime.issues.map((i) => i.days));
    }

    // Vazão (Throughput)
    const throughput = await queryThroughput(
      squad.project,
      sprint.id,
      startDate,
      endDate
    );

    // Eficiência de Fluxo
    const flowEfficiency = await queryFlowEfficiency(
      squad.project,
      sprint.id,
      startDate,
      endDate
    );

    // Transbordo (Spillover)
    const spillover = await querySpillover(
      squad.project,
      sprint.id,
      startDate,
      endDate
    );

    // Ocupação
    const sprintTeamSize = getSprintCapacity(squad.slug, sprint.id, squad.teamSize);
    const occupation = await queryOccupation(
      squad.project,
      sprint.id,
      sprintTeamSize,
      startDate,
      endDate
    );

    // Bugs / Sub-bugs (qualidade) — query simplificada do DB
    const bugData = await queryCompletedBugsFromDb(
      squad.project,
      sprint.id,
      startDate,
      endDate
    );
    bugsQuality.push({
      period: sprintRowToPeriod(sprint).shortName,
      bugs: bugData.bugs.length,
      subBugs: bugData.subBugs.length,
      bugKeys: bugData.bugs,
      subBugKeys: bugData.subBugs,
    });

    periodMetrics.push({
      period: sprintRowToPeriod(sprint),
      cycleTime,
      throughput,
      flowEfficiency,
      spillover,
      occupation,
    });
  }

  // 3. Progresso da Release ativa (usa config da squad — sem Jira API)
  const activeFixVersion = squad.r2FixVersion;
  const releaseDeadline = "2026-07-31"; // Default deadline

  const r2Progress = await queryR2Progress(
    activeFixVersion,
    squad.teamFieldValue,
    releaseDeadline,
    activeFixVersion.split(" - ")[0] || "Release"
  );

  // 4. Percentis combinados (amostra de todas as sprints)
  const percentiles = {
    p50: calculateP50(allCycleTimes),
    p85: calculateP85(allCycleTimes),
    p95: calculateP95(allCycleTimes),
    sampleSize: allCycleTimes.length,
  };

  // 5. Forecast (Épicos e Features R2)
  const forecastBase = await queryForecast(
    activeFixVersion,
    squad.teamFieldValue
  );

  // História: usar o MESMO P85 da Confiança de Entrega (percentis combinados)
  const forecast = {
    ...forecastBase,
    story: { type: "História", p85Days: percentiles.p85, sampleSize: percentiles.sampleSize },
  };

  // 6. KPIs
  const kpis = buildKpis(periodMetrics);

  // 7. Nota para stakeholders (Cycle Time)
  const lastPeriod = periodMetrics[periodMetrics.length - 1];
  const stakeholderNote =
    lastPeriod?.cycleTime.p85
      ? generateCycleTimeNote(lastPeriod.cycleTime.issues, lastPeriod.cycleTime.p85)
      : undefined;

  // 8. Tabela evolução
  const evolution = buildEvolution(periodMetrics);

  // 9. Burndown R2
  const burndown = buildBurndown(periodMetrics, r2Progress);

  // 10. Insights
  const insights = generateInsights(periodMetrics, r2Progress);

  return {
    squad,
    periods,
    generatedAt: new Date().toISOString(),
    kpis,
    periodMetrics,
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

// ─── Bug Query (DB-backed) ───────────────────────────────────────────────────

/**
 * Busca bugs e sub-bugs concluídos de uma sprint a partir do DB.
 * Equivalente ao fetchCompletedBugs do path Jira-direto.
 */
async function queryCompletedBugsFromDb(
  project: string,
  sprintId: number,
  startDate: string,
  endDate: string
): Promise<{ bugs: string[]; subBugs: string[] }> {
  const { db } = getDatabase();

  const DONE_STATUSES = ["Concluído", "Done", "Closed", "Finalizado"];
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Query bugs da sprint com status Concluído que transitaram durante o período
  const bugRows = await db
    .select({ key: issues.key })
    .from(issues)
    .where(
      and(
        eq(issues.project, project),
        eq(issues.sprintId, sprintId),
        eq(issues.issueType, "Bug"),
        inArray(issues.status, DONE_STATUSES)
      )
    );

  const subBugRows = await db
    .select({ key: issues.key })
    .from(issues)
    .where(
      and(
        eq(issues.project, project),
        eq(issues.sprintId, sprintId),
        eq(issues.issueType, "Sub-bug"),
        inArray(issues.status, DONE_STATUSES)
      )
    );

  // Verificar quais transitaram para Done durante o período da sprint
  const allBugKeys = [...bugRows.map((b: { key: string }) => b.key), ...subBugRows.map((b: { key: string }) => b.key)];

  if (allBugKeys.length === 0) {
    return { bugs: [], subBugs: [] };
  }

  const transitions = await db
    .select({ issueKey: changelogEvents.issueKey })
    .from(changelogEvents)
    .where(
      and(
        inArray(changelogEvents.issueKey, allBugKeys),
        inArray(changelogEvents.toStatus, DONE_STATUSES),
        between(changelogEvents.timestamp, start, end)
      )
    );

  const completedDuringPeriod = new Set(transitions.map((t: { issueKey: string }) => t.issueKey));

  return {
    bugs: bugRows.filter((b: { key: string }) => completedDuringPeriod.has(b.key)).map((b: { key: string }) => b.key),
    subBugs: subBugRows.filter((b: { key: string }) => completedDuringPeriod.has(b.key)).map((b: { key: string }) => b.key),
  };
}

// ─── Helper Functions ────────────────────────────────────────────────────────
// Replicam a lógica do sprint-adapter.ts original mas operam sobre SprintRow do DB

function sprintRowToPeriod(sprint: SprintRow): Period {
  const match = sprint.name.match(/Sprint\s*(\d+)/i);
  const num = match ? match[1] : sprint.name.match(/(\d+)/)?.[1] || sprint.id.toString();

  return {
    type: "sprint",
    id: sprint.id,
    label: `Sprint ${num}`,
    shortName: `S${num}`,
    startDate: sprint.startDate.toISOString(),
    endDate: sprint.endDate.toISOString(),
  };
}

function sprintRowsToPeriods(sprints: SprintRow[]): Period[] {
  return sprints.map(sprintRowToPeriod);
}

function buildKpis(periodMetrics: PeriodMetrics[]): KpiSummary {
  const current = periodMetrics[periodMetrics.length - 1];
  const previous = periodMetrics.length > 1 ? periodMetrics[periodMetrics.length - 2] : null;

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
    spilloverOrWip: buildKpiItem(
      "Transbordo",
      current?.spillover?.percentage ?? 0,
      previous?.spillover?.percentage ?? 0,
      "%",
      previous?.period.shortName ?? "",
      "lower"
    ),
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
    // lower is better
    deltaDirection = delta > 0 ? "up" : "down";
    status = delta < 0 ? "good" : "danger";
  }

  // Ajustar status para warn em casos intermediários
  if (status === "danger" && Math.abs(delta) < currentValue * 0.1) {
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

function buildEvolution(periodMetrics: PeriodMetrics[]): EvolutionRow[] {
  const rows: EvolutionRow[] = [
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
      metric: "Transbordo",
      values: periodMetrics.map((p) => `${p.spillover?.percentage ?? 0}%`),
      ...detectTrend(periodMetrics.map((p) => p.spillover?.percentage ?? 0), "lower"),
    },
    {
      metric: "Ocupação",
      values: periodMetrics.map((p) => `${p.occupation.percentage}%`),
      ...detectTrend(periodMetrics.map((p) => p.occupation.percentage), "neutral"),
    },
  ];
  return rows;
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

  if (Math.abs(diff) < threshold) {
    const mid = values.length > 2 ? values[1] : first;
    if (Math.abs(mid - first) > threshold && Math.abs(mid - last) > threshold) {
      return { trend: "variavel", trendColor: "flat" };
    }
    return { trend: "estavel", trendColor: "flat" };
  }

  const isGrowing = diff > 0;
  const trend: EvolutionRow["trend"] = isGrowing ? "crescente" : "decrescente";

  let trendColor: EvolutionRow["trendColor"];
  if (preference === "neutral") {
    trendColor = "flat";
  } else if (preference === "higher") {
    trendColor = isGrowing ? "up" : "down";
  } else {
    trendColor = isGrowing ? "down" : "up";
  }

  return { trend, trendColor };
}

function buildBurndown(
  periodMetrics: PeriodMetrics[],
  r2Progress: { epics: { total: number; done: number }; features: { total: number; done: number } }
): BurndownPoint[] {
  const totalItems = r2Progress.epics.total + r2Progress.features.total;
  const doneItems = r2Progress.epics.done + r2Progress.features.done;
  const remaining = totalItems - doneItems;

  return periodMetrics.map((pm, idx) => ({
    period: pm.period,
    idealRemaining: Math.max(0, totalItems - Math.round((totalItems / periodMetrics.length) * (idx + 1))),
    realRemaining: Math.max(0, remaining + (periodMetrics.length - 1 - idx)),
  }));
}

function generateInsights(
  periodMetrics: PeriodMetrics[],
  r2Progress: { features: { total: number; done: number }; releaseName: string }
): InsightItem[] {
  const insights: InsightItem[] = [];
  if (periodMetrics.length === 0) return insights;

  const current = periodMetrics[periodMetrics.length - 1];
  const first = periodMetrics[0];

  // Cycle Time em escalada
  if (
    current.cycleTime.p85 &&
    first.cycleTime.p85 &&
    current.cycleTime.p85 > first.cycleTime.p85 * 2
  ) {
    insights.push({
      title: "CT P85 em escalada crítica",
      text: `CT P85 aumentou de ${first.cycleTime.p85}d para ${current.cycleTime.p85}d nas últimas sprints. Priorizar conclusão de itens antigos e limitar WIP.`,
      severity: "red",
    });
  }

  // Transbordo crítico
  const avgSpillover =
    periodMetrics.reduce((sum, p) => sum + (p.spillover?.percentage ?? 0), 0) /
    periodMetrics.length;
  if (avgSpillover > 50) {
    insights.push({
      title: "Transbordo estável em nível crítico",
      text: `Transbordo médio de ${Math.round(avgSpillover)}% indica comprometimento sistematicamente acima da capacidade. Reduzir scope comprometido em 30-40%.`,
      severity: "yellow",
    });
  }

  // R2 com risco
  const featuresDone = r2Progress.features.done;
  const featuresTotal = r2Progress.features.total;
  if (featuresTotal > 0 && featuresDone / featuresTotal < 0.5) {
    insights.push({
      title: `${r2Progress.releaseName} exige aceleração significativa`,
      text: `Apenas ${featuresDone} de ${featuresTotal} Features concluídas (${Math.round((featuresDone / featuresTotal) * 100)}%). Ritmo atual requer aceleração para atingir a meta.`,
      severity: "blue",
    });
  }

  // Vazão positiva
  const throughputs = periodMetrics.map((p) => p.throughput.total);
  const minT = Math.min(...throughputs);
  const maxT = Math.max(...throughputs);
  if (maxT - minT <= 3 && throughputs.length >= 2) {
    insights.push({
      title: "Vazão demonstra consistência",
      text: `Vazão estável entre ${minT}-${maxT} cards/sprint mostra capacidade de entrega previsível.`,
      severity: "green",
    });
  }

  // Garantir sempre 4 insights
  while (insights.length < 4) {
    if (!insights.find((i) => i.severity === "green")) {
      insights.push({
        title: "Oportunidade de melhoria",
        text: "Foco em reduzir filas de espera (Code Review, Waiting for Test) pode melhorar significativamente a eficiência de fluxo.",
        severity: "green",
      });
    } else {
      break;
    }
  }

  return insights.slice(0, 4);
}
