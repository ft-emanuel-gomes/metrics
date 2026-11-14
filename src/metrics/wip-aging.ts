import { StatusTransition } from "@/services/jira-changelog";
import { calendarDaysBetween } from "@/lib/utils";
import type { KpiItem } from "@/adapters/types";

/**
 * Meta do WIP Aging: nenhum item em andamento pode passar de 10 dias corridos.
 * Regra de negócio: se o item mais antigo tiver MAIS de 10 dias, o indicador não fica verde.
 */
export const WIP_AGING_LIMIT_DAYS = 10;

/** Rótulo único do KPI de WIP Aging (usado como chave do tooltip no dashboard). */
export const WIP_AGING_KPI_LABEL = "WIP Aging";

export interface WipAgingSummary {
  /** Idade (dias corridos) do item em andamento mais antigo. 0 se não houver WIP. */
  oldestDays: number;
  /** Quantidade de itens em andamento com idade acima da meta. */
  overLimitCount: number;
  totalWip: number;
}

/**
 * Resume o WIP Aging em dias (sem percentuais): idade do item mais antigo e
 * quantos itens estão acima de WIP_AGING_LIMIT_DAYS.
 */
export function summarizeWipAging(
  wip: { totalWip: number; issues?: { agingDays: number }[] } | undefined
): WipAgingSummary {
  const ages = (wip?.issues ?? []).map((i) => i.agingDays);
  return {
    oldestDays: ages.length > 0 ? Math.max(...ages) : 0,
    overLimitCount: ages.filter((d) => d > WIP_AGING_LIMIT_DAYS).length,
    totalWip: wip?.totalWip ?? ages.length,
  };
}

/**
 * KPI de WIP Aging em dias. Valor = idade do item mais antigo; delta = itens acima da meta.
 * Status: "good" somente se o item mais antigo tiver até WIP_AGING_LIMIT_DAYS.
 */
export function buildWipAgingKpi(
  wip: { totalWip: number; issues?: { agingDays: number }[] } | undefined
): KpiItem {
  const s = summarizeWipAging(wip);
  const ok = s.oldestDays <= WIP_AGING_LIMIT_DAYS;
  return {
    label: WIP_AGING_KPI_LABEL,
    value: `${s.oldestDays}d`,
    numericValue: s.oldestDays,
    status: ok ? "good" : "danger",
    delta: `${s.overLimitCount}/${s.totalWip} itens > ${WIP_AGING_LIMIT_DAYS}d`,
    deltaDirection: ok ? "flat" : "up",
    previousValue: `Total WIP: ${s.totalWip}`,
  };
}

/**
 * Bucket de aging para WIP.
 */
export interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number | null; // null = sem limite superior
  count: number;
  percentage: number;
  color: string; // Tailwind color class
}

/**
 * Issue individual com seu aging.
 */
export interface WipIssueAging {
  key: string;
  summary: string;
  status: string;
  agingDays: number;
  lastTransitionDate: string;
}

/**
 * Resultado completo de WIP Aging (Kanban only).
 */
export interface WipAgingResult {
  totalWip: number;
  buckets: AgingBucket[];
  issues: WipIssueAging[];
}

/**
 * Definição dos buckets de aging.
 * maxDays é EXCLUSIVO e igual ao minDays do bucket seguinte, para que as faixas sejam
 * contíguas: 0–6 | 7–14 | 15–30 | 31+. (Antes, 14 e 30 dias não caíam em nenhuma faixa.)
 */
const AGING_BUCKETS_DEF = [
  { label: "< 7d", minDays: 0, maxDays: 7, color: "bg-emerald-500" },
  { label: "7-14d", minDays: 7, maxDays: 15, color: "bg-amber-400" },
  { label: "15-30d", minDays: 15, maxDays: 31, color: "bg-orange-500" },
  { label: "> 30d", minDays: 31, maxDays: null, color: "bg-red-500" },
];

/**
 * Calcula o aging de uma issue em WIP.
 * Aging = dias corridos desde a última transição de status para o status atual.
 *
 * @param transitions - Changelog da issue (ordenado cronologicamente)
 * @param referenceDate - Data de referência (geralmente "agora")
 */
export function calculateIssueAging(
  transitions: StatusTransition[],
  referenceDate: Date
): number {
  if (transitions.length === 0) return 0;

  // Última transição = quando entrou no status atual
  const lastTransition = transitions[transitions.length - 1];
  const lastDate = new Date(lastTransition.timestamp);

  return calendarDaysBetween(lastDate, referenceDate);
}

/**
 * Calcula WIP Aging para squads Kanban.
 * Agrupa issues em buckets de aging e calcula percentuais.
 *
 * @param issues - Issues em WIP com seus changelogs
 * @param referenceDate - Data de referência (default: agora)
 */
export function calculateWipAging(
  issues: { key: string; summary: string; status: string; transitions: StatusTransition[] }[],
  referenceDate: Date = new Date()
): WipAgingResult {
  if (issues.length === 0) {
    return {
      totalWip: 0,
      buckets: AGING_BUCKETS_DEF.map((b) => ({
        ...b,
        count: 0,
        percentage: 0,
      })),
      issues: [],
    };
  }

  // Calcular aging de cada issue
  const issuesWithAging: WipIssueAging[] = issues.map((issue) => {
    const agingDays = calculateIssueAging(issue.transitions, referenceDate);
    const lastTransition = issue.transitions[issue.transitions.length - 1];

    return {
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      agingDays,
      lastTransitionDate: lastTransition?.timestamp || "",
    };
  });

  // Agrupar em buckets
  const totalWip = issuesWithAging.length;
  const buckets: AgingBucket[] = AGING_BUCKETS_DEF.map((def) => {
    const count = issuesWithAging.filter((issue) => {
      if (def.maxDays === null) {
        return issue.agingDays >= def.minDays;
      }
      return issue.agingDays >= def.minDays && issue.agingDays < def.maxDays;
    }).length;

    return {
      ...def,
      count,
      percentage: totalWip > 0 ? Math.round((count / totalWip) * 100) : 0,
    };
  });

  // Ordenar issues por aging (maior primeiro)
  issuesWithAging.sort((a, b) => b.agingDays - a.agingDays);

  return {
    totalWip,
    buckets,
    issues: issuesWithAging,
  };
}
