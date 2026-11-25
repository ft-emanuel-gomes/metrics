import { businessDaysListBrt } from "@/lib/utils";
import { SubtaskWithEstimate } from "@/services/jira-search";

/** Status de card que tira as subtasks dele da conta */
const CANCELED_PARENT_STATUSES = new Set(["Cancelado", "CANCELADO", "Rejeitado"]);

/**
 * Resultado de ocupação para um período.
 */
export interface OccupationPeriodResult {
  allocatedHours: number;
  capacityHours: number;
  percentage: number;
}

/**
 * Subtask com Original Estimate para cálculo de ocupação.
 */
export interface SubtaskEstimate {
  key: string;
  originalEstimateSeconds: number;
}

/**
 * Resolve as horas alocadas aplicando a regra de negócio:
 * Para cada Standard Issue, compara a soma das subtasks filhas com o estimate do pai.
 * Usa o MAIOR valor. Nunca soma ambos.
 * O estimate do pai é descontado das subtasks canceladas/rejeitadas dele antes da comparação.
 * Se Standard Issue não tem subtasks → usa estimate da Standard Issue.
 * Se Standard Issue não tem estimate mas subtasks têm → usa soma subtasks.
 * Standard Issues sem subtasks e sem estimate próprio → contribuem 0h.
 */
export function resolveOccupationEstimates(
  standardIssues: SubtaskWithEstimate[],
  subtasksWithParent: SubtaskWithEstimate[],
  /** Subtasks canceladas/rejeitadas: as horas delas são descontadas da estimativa do card pai */
  canceledSubtasks: SubtaskWithEstimate[] = []
): number {
  // Máximo razoável: 12 semanas em segundos
  const MAX_ESTIMATE_SECONDS = 12 * 5 * 8 * 3600; // 1.728.000s (~480h)

  // Regra de negócio: a estimativa do card costuma incluir subtasks que depois foram canceladas.
  // Essas horas saem da estimativa do card antes da comparação com as subtasks ativas.
  const canceledByParent = new Map<string, number>();
  for (const sub of canceledSubtasks) {
    const val = Number(sub.originalEstimateSeconds) || 0;
    if (!sub.parentKey || val <= 0 || val > MAX_ESTIMATE_SECONDS) continue;
    canceledByParent.set(sub.parentKey, (canceledByParent.get(sub.parentKey) || 0) + val);
  }

  // Agrupar subtasks por parent key
  const subtasksByParent = new Map<string, number>();
  // Subtasks sem parent (órfãs) — somar separadamente
  let orphanSeconds = 0;

  for (const sub of subtasksWithParent) {
    const val = Number(sub.originalEstimateSeconds) || 0;
    if (val <= 0 || val > MAX_ESTIMATE_SECONDS) continue;
    // Card pai cancelado/rejeitado: a subtask não é trabalho, mesmo aberta
    if (sub.parentStatus && CANCELED_PARENT_STATUSES.has(sub.parentStatus)) continue;

    if (sub.parentKey) {
      subtasksByParent.set(sub.parentKey, (subtasksByParent.get(sub.parentKey) || 0) + val);
    } else {
      orphanSeconds += val;
    }
  }

  let totalSeconds = 0;

  // Para cada Standard Issue: max(soma_subtasks_filhas, estimate_da_standard_issue)
  const processedParents = new Set<string>();

  for (const issue of standardIssues) {
    const parentEstimate = Number(issue.originalEstimateSeconds) || 0;
    const validParentEstimate = parentEstimate > 0 && parentEstimate <= MAX_ESTIMATE_SECONDS
      ? Math.max(0, parentEstimate - (canceledByParent.get(issue.key) || 0))
      : 0;
    const subtaskSum = subtasksByParent.get(issue.key) || 0;

    // Regra: usar o MAIOR entre soma subtasks e estimate da Standard Issue
    totalSeconds += Math.max(validParentEstimate, subtaskSum);
    processedParents.add(issue.key);
  }

  // Subtasks cujo parent não está na lista de Standard Issues (pode ser de outra sprint)
  // Somar apenas as que pertencem a pais não processados
  for (const [parentKey, sum] of subtasksByParent.entries()) {
    if (!processedParents.has(parentKey)) {
      totalSeconds += sum;
    }
  }

  // Subtasks órfãs (sem parent definido)
  totalSeconds += orphanSeconds;

  return totalSeconds;
}

/**
 * Calcula a ocupação do time em um período.
 *
 * Regra: Para cada Standard Issue, usa o MAIOR entre:
 * - Soma do originalEstimate das subtasks filhas
 * - originalEstimate da própria Standard Issue
 * 
 * Ocupação % = horas alocadas / capacidade × 100
 * 
 * Outliers com originalEstimateSeconds acima de 12 semanas são descartados.
 */
export function calculateOccupation(
  standardEstimates: SubtaskWithEstimate[],
  subtasksWithParent: SubtaskWithEstimate[],
  teamSize: number,
  startDate: string,
  endDate: string,
  hoursPerDay: number = 6,
  customBusinessDays?: number,
  /** Subtasks canceladas/rejeitadas (descontadas da estimativa do card pai) */
  canceledSubtasks: SubtaskWithEstimate[] = []
): OccupationPeriodResult {
  const totalSeconds = resolveOccupationEstimates(standardEstimates, subtasksWithParent, canceledSubtasks);
  const allocatedHours = Math.round(totalSeconds / 3600);

  // Dias úteis entre as datas do Jira, no fuso de Brasília (mesma contagem da Capacidade da Sprint)
  const businessDays = customBusinessDays || businessDaysListBrt(startDate, endDate).length;
  const capacityHours = teamSize * hoursPerDay * businessDays;

  const percentage =
    capacityHours > 0 ? Math.round((allocatedHours / capacityHours) * 100) : 0;

  return {
    allocatedHours,
    capacityHours,
    percentage,
  };
}
