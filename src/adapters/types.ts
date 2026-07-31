import type { SquadConfig } from "@/config/squads";
import type { CycleTimePeriodResult } from "@/metrics/cycle-time";
import type { ThroughputPeriodResult } from "@/metrics/throughput";
import type { FlowEfficiencyPeriodResult } from "@/metrics/flow-efficiency";
import type { SpilloverPeriodResult } from "@/metrics/spillover";
import type { WipAgingResult } from "@/metrics/wip-aging";
import type { OccupationPeriodResult } from "@/metrics/occupation";
import type { R2ProgressResult } from "@/metrics/r2-progress";
import type { ForecastResult } from "@/metrics/forecast";

/**
 * Período genérico (sprint ou janela kanban).
 */
export interface Period {
  type: "sprint" | "kanban";
  id?: number; // Sprint ID (apenas para sprint)
  label: string; // "Sprint 8" ou "Sem 25"
  shortName: string; // "S8" ou "Sem25"
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
}

/**
 * KPI card individual.
 */
export interface KpiItem {
  label: string;
  value: string;
  numericValue: number;
  status: "good" | "warn" | "danger" | "info" | "purple";
  delta: string;
  deltaDirection: "up" | "down" | "flat";
  previousValue: string;
}

/**
 * Resumo dos KPIs (5 obrigatórios + wipAging opcional).
 */
export interface KpiSummary {
  cycleTime: KpiItem;
  throughput: KpiItem;
  flowEfficiency: KpiItem;
  spilloverOrWip: KpiItem;
  occupation: KpiItem;
  wipAging?: KpiItem;
}

/**
 * Resultado de métricas por período.
 */
export interface PeriodMetrics {
  period: Period;
  cycleTime: CycleTimePeriodResult;
  throughput: ThroughputPeriodResult;
  flowEfficiency: FlowEfficiencyPeriodResult;
  spillover?: SpilloverPeriodResult;
  occupation: OccupationPeriodResult;
}

/**
 * Insight automático.
 */
export interface InsightItem {
  title: string;
  text: string;
  severity: "green" | "yellow" | "red" | "blue";
}

/**
 * Linha da tabela de evolução.
 */
export interface EvolutionRow {
  metric: string;
  values: string[];
  trend: "crescente" | "decrescente" | "estavel" | "variavel";
  trendColor: "up" | "down" | "flat";
}

/**
 * Dados do burndown.
 */
export interface BurndownPoint {
  period: Period;
  idealRemaining: number;
  realRemaining: number;
}

/**
 * Comparativo R1 vs R2.
 */
export interface R1vsR2Row {
  name: string;
  r1Value: string;
  r2Value: string;
  variation: string;
  trend: "up" | "down" | "flat";
  isPositive: boolean;
}

/**
 * Dados de bugs/sub-bugs por período (qualidade).
 */
export interface BugQualityData {
  period: string;
  bugs: number;
  subBugs: number;
  bugKeys: string[];
  subBugKeys: string[];
}

/**
 * Resultado consolidado do dashboard — retornado pelos adapters.
 */
export interface DashboardData {
  squad: SquadConfig;
  periods: Period[];
  generatedAt: string;
  kpis: KpiSummary;
  periodMetrics: PeriodMetrics[];
  wipAging?: WipAgingResult;
  r2Progress: R2ProgressResult;
  percentiles: { p50: number | null; p85: number | null; p95: number | null; sampleSize: number };
  forecast: ForecastResult;
  burndown: BurndownPoint[];
  evolution: EvolutionRow[];
  insights: InsightItem[];
  stakeholderNote?: string;
  bugsQuality: BugQualityData[];
  /** Indica se dados foram buscados via fallback direto do Jira (fora da janela de 3 meses) */
  isHistoricalFallback?: boolean;
}
