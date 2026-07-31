import { businessDaysBetween } from "@/lib/utils";

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
 * Calcula a ocupação do time em um período.
 *
 * Regra: Original Estimate das Standard Issues presentes na sprint.
 * Ocupação % = horas alocadas / capacidade × 100
 * 
 * Outliers com originalEstimateSeconds acima de 12 semanas (2.419.200s)
 * são descartados para evitar dados corrompidos no Jira.
 */
export function calculateOccupation(
  subtaskEstimates: SubtaskEstimate[],
  teamSize: number,
  startDate: string,
  endDate: string,
  hoursPerDay: number = 6
): OccupationPeriodResult {
  // Máximo razoável: 12 semanas em segundos (12 × 5 dias × 8h × 3600s)
  const MAX_ESTIMATE_SECONDS = 12 * 5 * 8 * 3600; // 1.728.000s (~480h)

  const totalSeconds = subtaskEstimates.reduce(
    (sum, s) => {
      const val = Number(s.originalEstimateSeconds) || 0;
      // Descartar outliers absurdos (dados corrompidos no Jira)
      return val > 0 && val <= MAX_ESTIMATE_SECONDS ? sum + val : sum;
    },
    0
  );
  const allocatedHours = Math.round(totalSeconds / 3600);

  const start = new Date(startDate);
  const end = new Date(endDate);
  const businessDays = businessDaysBetween(start, end);
  const capacityHours = teamSize * hoursPerDay * businessDays;

  const percentage =
    capacityHours > 0 ? Math.round((allocatedHours / capacityHours) * 100) : 0;

  return {
    allocatedHours,
    capacityHours,
    percentage,
  };
}
