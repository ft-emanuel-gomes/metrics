/**
 * Occupation metric — DB-backed query.
 * Replaces fetchSubtaskEstimates + calculateOccupation Jira-direct path
 * by querying subtask issues from the local Data_Store.
 *
 * Requirements: 4.6, 7.3
 */

import { eq, and, inArray, notInArray, between } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues } from "@/db/schema";
import {
  calculateOccupation,
  type OccupationPeriodResult,
  type SubtaskEstimate,
} from "@/metrics/occupation";

/**
 * Tipos de issue considerados como subtasks para o cálculo de ocupação.
 * Regra de negócio: Original Estimate das subtasks (Sub-task, Subtarefa, Sub-bug).
 */
const SUBTASK_TYPES = ["Sub-task", "Subtarefa", "Sub-bug"];

/**
 * Status excluídos — issues com estes status NÃO contam na ocupação.
 */
const EXCLUDED_STATUSES = ["Cancelado", "Lista de Pendências"];

/**
 * Calcula a ocupação do time a partir do banco de dados.
 *
 * Lógica:
 * 1. Query issues do DB onde project = project, sprint_id = sprintId,
 *    issue_type IN (Sub-task, Subtarefa, Sub-bug), status NOT IN (Cancelado, Lista de Pendências)
 * 2. Mapeia para SubtaskEstimate[] com { key, originalEstimateSeconds }
 * 3. Delega ao calculateOccupation(subtaskEstimates, teamSize, startDate, endDate)
 *
 * @param project - Código do projeto Jira (ex: "CT", "CS")
 * @param sprintId - ID da sprint
 * @param teamSize - Número de pessoas no time
 * @param startDate - Data de início do período (ISO 8601)
 * @param endDate - Data de fim do período (ISO 8601)
 * @returns OccupationPeriodResult idêntico ao path Jira-direto
 */
export async function queryOccupation(
  project: string,
  sprintId: number,
  teamSize: number,
  startDate: string,
  endDate: string
): Promise<OccupationPeriodResult> {
  const { db } = getDatabase();

  // 1. Buscar subtasks da sprint no DB, excluindo status cancelados
  const subtaskRows = await db
    .select({
      key: issues.key,
      originalEstimateSeconds: issues.originalEstimateSeconds,
    })
    .from(issues)
    .where(
      and(
        eq(issues.project, project),
        eq(issues.sprintId, sprintId),
        inArray(issues.issueType, SUBTASK_TYPES),
        notInArray(issues.status, EXCLUDED_STATUSES)
      )
    );

  // Empty state: nenhuma subtask na sprint
  if (subtaskRows.length === 0) {
    return { allocatedHours: 0, capacityHours: 0, percentage: 0 };
  }

  // 2. Mapear para SubtaskEstimate[] (tratar null como 0)
  const subtaskEstimates: SubtaskEstimate[] = subtaskRows.map((row: { key: string; originalEstimateSeconds: number | null }) => ({
    key: row.key,
    originalEstimateSeconds: row.originalEstimateSeconds ?? 0,
  }));

  // 3. Delegar ao cálculo existente
  return calculateOccupation(subtaskEstimates, teamSize, startDate, endDate);
}


/**
 * Calcula a ocupação do time para squads Kanban (sem sprint) a partir do banco de dados.
 * Filtra subtasks por data de criação dentro da janela temporal.
 *
 * Lógica:
 * 1. Query issues do DB onde project = project, created_date BETWEEN startDate AND endDate,
 *    issue_type IN (Sub-task, Subtarefa, Sub-bug), status NOT IN (Cancelado, Lista de Pendências)
 * 2. Mapeia para SubtaskEstimate[] com { key, originalEstimateSeconds }
 * 3. Delega ao calculateOccupation(subtaskEstimates, teamSize, startDate, endDate)
 *
 * @param project - Código do projeto Jira (ex: "RI", "RF")
 * @param teamSize - Número de pessoas no time
 * @param startDate - Data de início da janela temporal (ISO 8601)
 * @param endDate - Data de fim da janela temporal (ISO 8601)
 * @returns OccupationPeriodResult idêntico ao path Jira-direto
 */
export async function queryOccupationByDateRange(
  project: string,
  teamSize: number,
  startDate: string,
  endDate: string
): Promise<OccupationPeriodResult> {
  const { db } = getDatabase();

  const start = new Date(startDate);
  const end = new Date(endDate);

  // 1. Buscar subtasks pela data de criação dentro da janela temporal
  const subtaskRows = await db
    .select({
      key: issues.key,
      originalEstimateSeconds: issues.originalEstimateSeconds,
    })
    .from(issues)
    .where(
      and(
        eq(issues.project, project),
        inArray(issues.issueType, SUBTASK_TYPES),
        notInArray(issues.status, EXCLUDED_STATUSES),
        between(issues.createdDate, start, end)
      )
    );

  // Empty state: nenhuma subtask na janela temporal
  if (subtaskRows.length === 0) {
    return { allocatedHours: 0, capacityHours: 0, percentage: 0 };
  }

  // 2. Mapear para SubtaskEstimate[] (tratar null como 0)
  const subtaskEstimates: SubtaskEstimate[] = subtaskRows.map((row: { key: string; originalEstimateSeconds: number | null }) => ({
    key: row.key,
    originalEstimateSeconds: row.originalEstimateSeconds ?? 0,
  }));

  // 3. Delegar ao cálculo existente
  return calculateOccupation(subtaskEstimates, teamSize, startDate, endDate);
}
