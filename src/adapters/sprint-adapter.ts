import type { SquadConfig } from "@/config/squads";
import { getLatestSprints, type SprintData } from "@/services/jira-sprints";
import {
  fetchCompletedIssues,
  fetchCompletedIssuesWithChangelogs,
  fetchSpilledIssues,
  fetchStandardIssuesWithEstimates,
  fetchCompletedBugs,
  fetchR2Epics,
  fetchR2Features,
  fetchWipIssues,
} from "@/services/jira-search";
import { fetchChangelogsBatch } from "@/services/jira-changelog";
import { getSprintCapacity } from "@/services/capacity-store";
import { fetchProjectVersions, findActiveRelease } from "@/services/jira-versions";
import { calculateCycleTimeP85, generateCycleTimeNote } from "@/metrics/cycle-time";
import { calculateThroughput } from "@/metrics/throughput";
import {
  calculatePeriodFlowEfficiency,
  detectBottleneck,
} from "@/metrics/flow-efficiency";
import { calculateSpillover } from "@/metrics/spillover";
import { calculateOccupation } from "@/metrics/occupation";
import { calculateR2Progress } from "@/metrics/r2-progress";
import { calculateForecast } from "@/metrics/forecast";
import { calculateWipAging } from "@/metrics/wip-aging";
import { calculateP50, calculateP85, calculateP95 } from "@/metrics/percentile";
import { formatShortDate } from "@/lib/utils";
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
 * Adapter para squads com metodologia Sprint.
 * Orquestra toda a sequência de busca de dados e cálculo de métricas.
 */
export async function fetchSprintDashboard(
  squad: SquadConfig,
  requestedSprintIds?: number[],
  issueTypeFilter?: string[]
): Promise<DashboardData> {
  // 1. Buscar sprints concluídas — se IDs específicos foram pedidos, filtrar
  let sprints = await getLatestSprints(squad.boardId, 10);

  if (requestedSprintIds && requestedSprintIds.length > 0) {
    sprints = sprints.filter((s) => requestedSprintIds.includes(s.id));
    if (sprints.length === 0) {
      // Fallback: usar últimas 3 se nenhum ID válido encontrado
      sprints = await getLatestSprints(squad.boardId, 3);
    }
  } else {
    // Padrão: últimas 3
    sprints = sprints.slice(-3);
  }

  const periods = sprintsToPeriods(sprints);

  // 2. Para cada sprint, buscar dados e calcular métricas
  const periodMetrics: PeriodMetrics[] = [];
  const allCycleTimes: number[] = [];
  const bugsQuality: import("./types").BugQualityData[] = [];

  for (const sprint of sprints) {
    const period = sprintToPeriod(sprint);

    // OTIMIZADO: Buscar issues concluídas COM changelogs inline (1-2 requests em vez de 15+)
    let completedWithCL = await fetchCompletedIssuesWithChangelogs(
      squad.project,
      sprint.id,
      sprint.startDate,
      sprint.endDate
    );

    // Buscar itens de Design concluídos no período (sem filtro de sprint)
    const designItems = await fetchCompletedIssuesWithChangelogs(
      squad.project,
      null, // Sem sprint — busca por período
      sprint.startDate,
      sprint.endDate
    );
    // Filtrar apenas Design e evitar duplicatas (issues que já estão na sprint)
    const existingKeys = new Set(completedWithCL.map((i) => i.key));
    const designExtras = designItems.filter(
      (i) => (i.issueType === "Design") && !existingKeys.has(i.key)
    );
    // Mesclar Design extras à lista de concluídos
    completedWithCL = [...completedWithCL, ...designExtras];

    // Aplicar filtro por issue type (se ativo)
    if (issueTypeFilter && issueTypeFilter.length > 0) {
      completedWithCL = completedWithCL.filter((i) =>
        issueTypeFilter.includes(i.issueType) || issueTypeFilter.includes(normalizeType(i.issueType))
      );
    }

    // Montar estrutura para cálculos (já tem transitions inline)
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

    // Eficiência de Fluxo
    const flowEfficiency = calculatePeriodFlowEfficiency(issuesWithChangelogs);

    // Transbordo
    const spilledIssues = await fetchSpilledIssues(
      squad.project,
      sprint.id,
      sprint.startDate,
      sprint.endDate
    );
    const spillover = calculateSpillover(spilledIssues, completedWithCL);

    // Ocupação (Original Estimate das Standard Issues — usa capacidade salva por sprint)
    let standardEstimates = await fetchStandardIssuesWithEstimates(squad.project, sprint.id);
    // Aplicar filtro por issue type na ocupação (se ativo)
    if (issueTypeFilter && issueTypeFilter.length > 0) {
      standardEstimates = standardEstimates.filter((s) =>
        s.issueType && (issueTypeFilter.includes(s.issueType) || issueTypeFilter.includes(normalizeType(s.issueType)))
      );
    }
    const sprintTeamSize = getSprintCapacity(squad.slug, sprint.id, squad.teamSize);
    const occupation = calculateOccupation(
      standardEstimates,
      sprintTeamSize,
      sprint.startDate,
      sprint.endDate
    );

    // Bugs / Sub-bugs (qualidade)
    const { bugs: sprintBugs, subBugs: sprintSubBugs } = await fetchCompletedBugs(
      squad.project, sprint.id, sprint.startDate, sprint.endDate
    );
    bugsQuality.push({
      period: sprintToPeriod(sprint).shortName,
      bugs: sprintBugs.length,
      subBugs: sprintSubBugs.length,
      bugKeys: sprintBugs.map((b) => b.key),
      subBugKeys: sprintSubBugs.map((b) => b.key),
    });

    periodMetrics.push({
      period,
      cycleTime,
      throughput,
      flowEfficiency,
      spillover,
      occupation,
    });
  }

  // 3. Progresso da Release ativa (dinâmico — identifica R2, R3, etc. automaticamente)
  const projectVersions = await fetchProjectVersions("EP");
  const activeRelease = findActiveRelease(projectVersions);
  const activeFixVersion = activeRelease?.name || squad.r2FixVersion;
  const releaseDeadline = activeRelease?.releaseDate || "2026-07-31";

  const [r2Epics, r2Features] = await Promise.all([
    fetchR2Epics(activeFixVersion, squad.teamFieldValue),
    fetchR2Features(activeFixVersion, squad.teamFieldValue),
  ]);
  const r2Progress = calculateR2Progress(r2Epics, r2Features, releaseDeadline, activeRelease?.name.split(" - ")[0] || "R2");

  // 4. Percentis combinados (amostra de todas as sprints)
  const percentiles = {
    p50: calculateP50(allCycleTimes),
    p85: calculateP85(allCycleTimes),
    p95: calculateP95(allCycleTimes),
    sampleSize: allCycleTimes.length,
  };

  // 5. Forecast (Épicos e Features R2 + Histórias = média CT P85 das sprints)
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

  // 6. WIP Aging (realtime — issues atualmente no fluxo, sem filtro de sprint)
  const wipIssues = await fetchWipIssues(squad.project);
  const wipKeys = wipIssues.map((i) => i.key);
  const wipChangelogs = await fetchChangelogsBatch(wipKeys);
  const wipWithChangelogs = wipIssues.map((i) => ({
    key: i.key,
    summary: i.summary,
    status: i.status,
    transitions: wipChangelogs.get(i.key) || [],
  }));
  const wipAging = calculateWipAging(wipWithChangelogs);

  // 7. KPIs
  const kpis = buildKpis(periodMetrics, wipAging);

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

  // 10. (R1 vs R2 removido)

  // 11. Insights
  const insights = generateInsights(periodMetrics, r2Progress);

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

// --- R1 Metrics Calculator ---

/**
 * Calcula métricas resumidas de sprints R1 (anteriores ao período atual).
 * Busca issues concluídas e changelogs para obter CT e Throughput reais.
 */
async function calculateR1Metrics(
  squad: SquadConfig,
  r1Sprints: SprintData[]
): Promise<{ avgCT: number; avgThroughput: number; avgSpillover: number; avgEfficiency: number }> {
  let totalCT = 0;
  let ctCount = 0;
  let totalThroughput = 0;
  let totalSpillover = 0;
  let totalEfficiency = 0;

  for (const sprint of r1Sprints) {
    // Buscar issues concluídas
    const completedIssues = await fetchCompletedIssues(
      squad.project,
      sprint.id,
      sprint.startDate,
      sprint.endDate
    );

    // Throughput
    totalThroughput += completedIssues.length;

    // Cycle Time (simplificado: buscar changelogs)
    const issueKeys = completedIssues.map((i) => i.key);
    const changelogs = await fetchChangelogsBatch(issueKeys);
    const issuesWithChangelogs = completedIssues.map((issue) => ({
      key: issue.key,
      transitions: changelogs.get(issue.key) || [],
    }));
    const ct = calculateCycleTimeP85(issuesWithChangelogs);
    if (ct.p85 !== null) {
      totalCT += ct.p85;
      ctCount++;
    }

    // Eficiência
    const eff = calculatePeriodFlowEfficiency(issuesWithChangelogs);
    totalEfficiency += eff.efficiency;

    // Spillover
    const spilled = await fetchSpilledIssues(squad.project, sprint.id, sprint.startDate, sprint.endDate);
    const committed = spilled.length + completedIssues.length;
    if (committed > 0) {
      totalSpillover += Math.round((spilled.length / committed) * 100);
    }
  }

  const n = r1Sprints.length || 1;
  return {
    avgCT: ctCount > 0 ? Math.round(totalCT / ctCount) : 0,
    avgThroughput: +(totalThroughput / n).toFixed(1),
    avgSpillover: Math.round(totalSpillover / n),
    avgEfficiency: Math.round(totalEfficiency / n),
  };
}

// --- Helpers ---

/**
 * Normaliza tipo de issue para comparação com filtro.
 */
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

function sprintToPeriod(sprint: SprintData): Period {
  // Extrair número da sprint do nome e simplificar
  // Ex: "CT Sprint 8", "Downstream Sprint 9" → label: "Sprint 9", shortName: "S9"
  const match = sprint.name.match(/Sprint\s*(\d+)/i);
  const num = match ? match[1] : sprint.name.match(/(\d+)/)?.[1] || sprint.id.toString();

  return {
    type: "sprint",
    id: sprint.id,
    label: `Sprint ${num}`,
    shortName: `S${num}`,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
  };
}

function sprintsToPeriods(sprints: SprintData[]): Period[] {
  return sprints.map(sprintToPeriod);
}

function buildKpis(periodMetrics: PeriodMetrics[], wipAging: { totalWip: number; buckets: { label: string; minDays: number; count: number; percentage: number }[] }): KpiSummary {
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
    // Verificar se é variável (sobe e desce)
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
    trendColor = isGrowing ? "down" : "up"; // lower is better, so growing = bad
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

  // Simplificado: distribuir redução ideal linearmente
  return periodMetrics.map((pm, idx) => ({
    period: pm.period,
    idealRemaining: Math.max(0, totalItems - Math.round((totalItems / periodMetrics.length) * (idx + 1))),
    realRemaining: Math.max(0, remaining + (periodMetrics.length - 1 - idx)),
  }));
}

function buildR1vsR2(periodMetrics: PeriodMetrics[]): R1vsR2Row[] {
  // Compara R1 (primeiras sprints, antes de 30/04/2026) vs R2 (sprints atuais)
  // Usa os dados dos periodMetrics disponíveis como R2
  // e calcula médias para apresentar
  if (periodMetrics.length < 2) return [];

  // R2 = média dos períodos atuais (os que temos)
  const r2CT = Math.round(
    periodMetrics.reduce((s, p) => s + (p.cycleTime.p85 ?? 0), 0) / periodMetrics.length
  );
  const r2Throughput = +(
    periodMetrics.reduce((s, p) => s + p.throughput.total, 0) / periodMetrics.length
  ).toFixed(1);
  const r2Spillover = Math.round(
    periodMetrics.reduce((s, p) => s + (p.spillover?.percentage ?? 0), 0) / periodMetrics.length
  );
  const r2Efficiency = Math.round(
    periodMetrics.reduce((s, p) => s + p.flowEfficiency.efficiency, 0) / periodMetrics.length
  );

  return [
    buildR1vsR2Row("CT P85", r2CT, r2CT, "d", "lower"),
    buildR1vsR2Row("Vazão Média", r2Throughput, r2Throughput, "", "higher"),
    buildR1vsR2Row("Transbordo Médio", r2Spillover, r2Spillover, "%", "lower"),
    buildR1vsR2Row("Eficiência Média", r2Efficiency, r2Efficiency, "%", "higher"),
  ];
}

/**
 * Calcula R1 vs R2 com dados reais de ambos os períodos.
 * R1: sprints 1-5 (encerradas antes de 30/04/2026)
 * R2: sprints atuais (passadas como periodMetrics)
 */
export function buildR1vsR2WithHistory(
  r1Metrics: { avgCT: number; avgThroughput: number; avgSpillover: number; avgEfficiency: number },
  periodMetrics: PeriodMetrics[]
): R1vsR2Row[] {
  if (periodMetrics.length === 0) return [];

  const r2CT = Math.round(
    periodMetrics.reduce((s, p) => s + (p.cycleTime.p85 ?? 0), 0) / periodMetrics.length
  );
  const r2Throughput = +(
    periodMetrics.reduce((s, p) => s + p.throughput.total, 0) / periodMetrics.length
  ).toFixed(1);
  const r2Spillover = Math.round(
    periodMetrics.reduce((s, p) => s + (p.spillover?.percentage ?? 0), 0) / periodMetrics.length
  );
  const r2Efficiency = Math.round(
    periodMetrics.reduce((s, p) => s + p.flowEfficiency.efficiency, 0) / periodMetrics.length
  );

  return [
    buildR1vsR2Row("CT P85", r1Metrics.avgCT, r2CT, "d", "lower"),
    buildR1vsR2Row("Vazão Média", r1Metrics.avgThroughput, r2Throughput, "", "higher"),
    buildR1vsR2Row("Transbordo Médio", r1Metrics.avgSpillover, r2Spillover, "%", "lower"),
    buildR1vsR2Row("Eficiência Média", r1Metrics.avgEfficiency, r2Efficiency, "%", "higher"),
  ];
}

function buildR1vsR2Row(
  name: string,
  r1: number,
  r2: number,
  unit: string,
  preference: "higher" | "lower"
): R1vsR2Row {
  const diff = r2 - r1;
  const pctChange = r1 !== 0 ? Math.round((diff / r1) * 100) : 0;
  const sign = pctChange > 0 ? "+" : "";
  const variation = unit === "%" ? `${sign}${diff}pp` : `${sign}${pctChange}%`;

  const isPositive =
    preference === "higher" ? diff > 0 : diff < 0;

  return {
    name,
    r1Value: `${r1}${unit}`,
    r2Value: `${r2}${unit}`,
    variation,
    trend: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
    isPositive,
  };
}

function generateInsights(
  periodMetrics: PeriodMetrics[],
  r2Progress: { features: { total: number; done: number } }
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
      title: "R2 exige aceleração significativa",
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
