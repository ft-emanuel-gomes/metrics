import { businessDaysBetween } from "@/lib/utils";
import { SubtaskWithEstimate } from "@/services/jira-search";

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
 * Se Standard Issue não tem subtasks → usa estimate da Standard Issue.
 * Se Standard Issue não tem estimate mas subtasks têm → usa soma subtasks.
 * Standard Issues sem subtasks e sem estimate próprio → contribuem 0h.
 */
export function resolveOccupationEstimates(
  standardIssues: SubtaskWithEstimate[],
  subtasksWithParent: SubtaskWithEstimate[]
): number {
  // Máximo razoável: 12 semanas em segundos
  const MAX_ESTIMATE_SECONDS = 12 * 5 * 8 * 3600; // 1.728.000s (~480h)

  // Agrupar subtasks por parent key
  const subtasksByParent = new Map<string, number>();
  // Subtasks sem parent (órfãs) — somar separadamente
  let orphanSeconds = 0;

  for (const sub of subtasksWithParent) {
    const val = Number(sub.originalEstimateSeconds) || 0;
    if (val <= 0 || val > MAX_ESTIMATE_SECONDS) continue;

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
    const validParentEstimate = parentEstimate > 0 && parentEstimate <= MAX_ESTIMATE_SECONDS ? parentEstimate : 0;
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
  customBusinessDays?: number
): OccupationPeriodResult {
  const totalSeconds = resolveOccupationEstimates(standardEstimates, subtasksWithParent);
  const allocatedHours = Math.round(totalSeconds / 3600);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const businessDays = customBusinessDays || businessDaysBetween(start, end);
  const capacityHours = teamSize * hoursPerDay * businessDays;

  const percentage =
    capacityHours > 0 ? Math.round((allocatedHours / capacityHours) * 100) : 0;

  return {
    allocatedHours,
    capacityHours,
    percentage,
  };
}
