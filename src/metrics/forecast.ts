import { StatusTransition } from "@/services/jira-changelog";
import { calculateP85 } from "./percentile";
import { calendarDaysBetween } from "@/lib/utils";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";

/**
 * Resultado de forecast para um tipo de item.
 */
export interface ForecastItemResult {
  type: string; // "Épico", "Feature"
  p85Days: number | null;
  sampleSize: number;
}

/**
 * Resultado completo de forecast upstream.
 * Épicos, Features e Histórias de R2.
 */
export interface ForecastResult {
  epic: ForecastItemResult;
  feature: ForecastItemResult;
  story: ForecastItemResult;
}

/**
 * Item R2 com changelog para cálculo de forecast.
 */
export interface R2ItemWithChangelog {
  key: string;
  issueType: string;
  status: string;
  transitions: StatusTransition[];
}

/**
 * Calcula o Forecast Upstream para Épicos e Features de R2.
 *
 * REGRA:
 * - Mede o tempo (P85) que Épicos e Features da R2 levam desde que entram
 *   em progresso até serem concluídos.
 * - Para itens já concluídos: CT real (In Progress → Concluído)
 * - Para itens em andamento: aging atual (In Progress → hoje)
 * - Escopo: apenas itens com fixVersion = R2 + "Monte Bravo Teams" = squad
 *
 * @param r2Items - Épicos e Features R2 com seus changelogs e status atual
 * @param referenceDate - Data de referência para aging (default: hoje)
 */
export function calculateForecast(
  r2Items: R2ItemWithChangelog[],
  referenceDate: Date = new Date()
): ForecastResult {
  const epics = r2Items.filter(
    (i) => i.issueType === "Epic" || i.issueType === "Épico"
  );
  const features = r2Items.filter(
    (i) => i.issueType === "Feature"
  );
  const stories = r2Items.filter(
    (i) =>
      i.issueType === "História" ||
      i.issueType === "Story" ||
      i.issueType === "Bug" ||
      i.issueType === "Design" ||
      i.issueType === "Technical Debt"
  );

  return {
    epic: calculateR2TypeP85(epics, "Épico", referenceDate),
    feature: calculateR2TypeP85(features, "Feature", referenceDate),
    story: calculateR2TypeP85(stories, "História", referenceDate),
  };
}

/**
 * Calcula P85 do tempo de conclusão/aging para um grupo de itens R2.
 * - Concluídos: usa CT real (In Progress → Concluído)
 * - Em andamento: usa aging (In Progress → hoje)
 */
function calculateR2TypeP85(
  items: R2ItemWithChangelog[],
  typeName: string,
  referenceDate: Date
): ForecastItemResult {
  if (items.length === 0) {
    return { type: typeName, p85Days: null, sampleSize: 0 };
  }

  const days: number[] = [];

  for (const item of items) {
    const isDone = CYCLE_TIME_END_STATUSES.has(item.status);
    const ct = isDone
      ? calculateCompletedItemCT(item.transitions)
      : calculateItemAging(item.transitions, referenceDate);

    if (ct !== null && ct > 0) {
      days.push(ct);
    }
  }

  if (days.length === 0) {
    return { type: typeName, p85Days: null, sampleSize: 0 };
  }

  return {
    type: typeName,
    p85Days: calculateP85(days),
    sampleSize: days.length,
  };
}

/**
 * Calcula CT real de um item já concluído.
 * Tempo desde primeira transição para estado de trabalho até última transição para Concluído.
 */
function calculateCompletedItemCT(transitions: StatusTransition[]): number | null {
  if (transitions.length === 0) return null;

  const startDate = findFirstWorkDate(transitions);
  const endDate = findLastDoneDate(transitions);

  if (!startDate || !endDate) return null;
  return calendarDaysBetween(startDate, endDate);
}

/**
 * Calcula aging de um item em andamento.
 * Tempo desde primeira transição para estado de trabalho até hoje.
 */
function calculateItemAging(
  transitions: StatusTransition[],
  referenceDate: Date
): number | null {
  const startDate = findFirstWorkDate(transitions);
  if (!startDate) return null;
  return calendarDaysBetween(startDate, referenceDate);
}

/**
 * Encontra a data da primeira transição para um estado de trabalho.
 */
function findFirstWorkDate(transitions: StatusTransition[]): Date | null {
  const workStates = new Set([
    "In Progress", "Em Progresso", "Em Desenvolvimento",
    "Design Review", "Code Review", "Test",
  ]);

  for (const t of transitions) {
    if (workStates.has(t.toStatus)) {
      return new Date(t.timestamp);
    }
  }
  return null;
}

/**
 * Encontra a data da última transição para Concluído.
 */
function findLastDoneDate(transitions: StatusTransition[]): Date | null {
  for (let i = transitions.length - 1; i >= 0; i--) {
    if (CYCLE_TIME_END_STATUSES.has(transitions[i].toStatus)) {
      return new Date(transitions[i].timestamp);
    }
  }
  return null;
}
