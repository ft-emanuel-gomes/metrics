import { StatusTransition } from "@/services/jira-changelog";
import { calendarDaysBetween } from "@/lib/utils";

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
 */
const AGING_BUCKETS_DEF = [
  { label: "< 7d", minDays: 0, maxDays: 7, color: "bg-emerald-500" },
  { label: "7-14d", minDays: 7, maxDays: 14, color: "bg-amber-400" },
  { label: "15-30d", minDays: 15, maxDays: 30, color: "bg-orange-500" },
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
