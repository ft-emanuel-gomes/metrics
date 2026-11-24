import { StatusTransition } from "@/services/jira-changelog";
import { calendarDaysBetween } from "@/lib/utils";
import { CYCLE_TIME_START_STATUSES } from "@/config/status-mapping";
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
  /** Idade no fluxo como um todo (dias corridos desde a entrada no fluxo). */
  agingDays: number;
  /** Quando o card entrou no fluxo (início da contagem do aging). */
  flowStartDate: string;
  /** Dias na coluna atual (informativo; NÃO é o aging). */
  daysInCurrentStatus: number;
  lastTransitionDate: string;
  /**
   * Bloqueado = impedimento marcado no Jira (Flagged), a mesma regra do Resumo executivo.
   * Links "bloqueia"/"é bloqueado por" não contam. No gráfico, a bolinha é circulada em vermelho.
   */
  blocked: boolean;
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
 * Data em que o card entrou no fluxo (início da contagem do aging).
 * Regra de negócio: o aging considera o card no fluxo COMO UM TODO, não só a coluna atual.
 * Ex.: 5 dias em To Do + 10 dias em Progresso = 15 dias de WIP.
 *
 * - Início = PRIMEIRA transição para um status de início (To Do / A Fazer / Pendente / In Progress...),
 *   a mesma regra do Cycle Time.
 * - Cards que nasceram já em To Do não têm transição "para To Do": nesse caso o início é a data de criação.
 * - Sem transições e sem data de criação: retorna null (o chamador usa a última transição como fallback).
 */
export function findFlowStart(transitions: StatusTransition[], created?: string): string | null {
  const first = transitions.find((t) => CYCLE_TIME_START_STATUSES.has(t.toStatus));
  const bornInStart = transitions.length > 0 && CYCLE_TIME_START_STATUSES.has(transitions[0].fromStatus);
  if (created && (bornInStart || !first)) return created;
  return first ? first.timestamp : null;
}

/**
 * Calcula o aging de uma issue em WIP: dias corridos desde a entrada no fluxo (ver findFlowStart).
 *
 * @param transitions - Changelog da issue (ordenado cronologicamente)
 * @param referenceDate - Data de referência (geralmente "agora")
 * @param created - Data de criação da issue (ISO 8601), quando disponível
 */
export function calculateIssueAging(
  transitions: StatusTransition[],
  referenceDate: Date,
  created?: string
): number {
  const start = findFlowStart(transitions, created);
  if (start) return Math.max(0, calendarDaysBetween(new Date(start), referenceDate));
  // Fallback (dado antigo sem criação e sem transição de início): tempo no status atual
  if (transitions.length === 0) return 0;
  return Math.max(0, calendarDaysBetween(new Date(transitions[transitions.length - 1].timestamp), referenceDate));
}
/**
 * Calcula WIP Aging para squads Kanban.
 * Agrupa issues em buckets de aging e calcula percentuais.
 *
 * @param issues - Issues em WIP com seus changelogs
 * @param referenceDate - Data de referência (default: agora)
 */
export function calculateWipAging(
  issues: { key: string; summary: string; status: string; created?: string; flagged?: boolean; transitions: StatusTransition[] }[],
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
    const agingDays = calculateIssueAging(issue.transitions, referenceDate, issue.created);
    const flowStart = findFlowStart(issue.transitions, issue.created);
    const lastTransition = issue.transitions[issue.transitions.length - 1];

    return {
      key: issue.key,
      summary: issue.summary,
      status: issue.status,
      agingDays,
      flowStartDate: flowStart || lastTransition?.timestamp || "",
      daysInCurrentStatus: lastTransition ? Math.max(0, calendarDaysBetween(new Date(lastTransition.timestamp), referenceDate)) : agingDays,
      lastTransitionDate: lastTransition?.timestamp || "",
      blocked: issue.flagged === true,
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
