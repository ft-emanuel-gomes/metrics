/**
 * Spillover (Transbordo) metric — DB-backed query.
 * Replaces fetchSpilledIssues + fetchCompletedIssues + calculateSpillover
 * by querying issues and changelog_events from the local Data_Store.
 *
 * Requirements: 4.4, 7.3
 */

import { eq, and, inArray, notInArray, between } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues, changelogEvents } from "@/db/schema";
import { calculateSpillover, type SpilloverPeriodResult } from "@/metrics/spillover";
import type { JiraIssue } from "@/services/jira-search";

/**
 * Tipos de issue válidos para cálculo de transbordo.
 * Mesmos tipos usados na query JQL do path direto via Jira.
 */
const VALID_TYPES = [
  "História", "Story", "Bug", "Design", "Technical Debt",
  "Kaizen", "Task", "Spike",
];

/**
 * Status que indicam conclusão (Done).
 */
const DONE_STATUSES = ["Concluído", "Done", "Closed", "Finalizado"];

/**
 * Status excluídos do cálculo de transbordo (ignorados totalmente).
 */
const EXCLUDED_STATUSES = ["Cancelado", "CANCELADO", "Rejeitado", "Lista de Pendências"];

/**
 * Calcula o transbordo (spillover) de uma sprint a partir do banco de dados.
 *
 * Lógica:
 * 1. Busca TODAS as issues da sprint no DB com tipos válidos e status não excluídos
 * 2. Para cada issue, verifica no changelog_events se transitou para "Concluído" durante o período da sprint
 * 3. Separa em: completedIssues (transitaram para Done) vs spilledIssues (não transitaram)
 * 4. Mapeia ambos para formato JiraIssue[]
 * 5. Delega ao calculateSpillover() existente
 *
 * @param project - Código do projeto Jira (ex: "CT", "CS")
 * @param sprintId - ID da sprint
 * @param startDate - Data de início da sprint (ISO 8601)
 * @param endDate - Data de fim da sprint (ISO 8601)
 * @returns SpilloverPeriodResult idêntico ao path Jira-direto
 */
export async function querySpillover(
  project: string,
  sprintId: number,
  startDate: string,
  endDate: string
): Promise<SpilloverPeriodResult> {
  const { db } = getDatabase();

  // 1. Buscar todas as issues da sprint com tipos válidos, excluindo cancelados
  const sprintIssues = await db
    .select({
      key: issues.key,
      summary: issues.summary,
      issueType: issues.issueType,
      status: issues.status,
      createdDate: issues.createdDate,
      resolutionDate: issues.resolutionDate,
    })
    .from(issues)
    .where(
      and(
        eq(issues.project, project),
        eq(issues.sprintId, sprintId),
        inArray(issues.issueType, VALID_TYPES),
        notInArray(issues.status, EXCLUDED_STATUSES)
      )
    );

  // Empty state: nenhuma issue na sprint
  if (sprintIssues.length === 0) {
    return { committed: 0, completed: 0, spilled: 0, percentage: 0 };
  }

  // 2. Buscar changelog_events dessas issues para verificar transição para Done
  const issueKeys = sprintIssues.map((i: { key: string }) => i.key);
  const sprintStart = new Date(startDate);
  const sprintEnd = new Date(endDate);

  const events = await db
    .select({
      issueKey: changelogEvents.issueKey,
      toStatus: changelogEvents.toStatus,
      timestamp: changelogEvents.timestamp,
    })
    .from(changelogEvents)
    .where(
      and(
        inArray(changelogEvents.issueKey, issueKeys),
        inArray(changelogEvents.toStatus, DONE_STATUSES),
        between(changelogEvents.timestamp, sprintStart, sprintEnd)
      )
    );

  // 3. Identificar quais issues transitaram para Done durante a sprint
  const completedKeys = new Set(events.map((e: { issueKey: string }) => e.issueKey));

  // 4. Separar em completed vs spilled e mapear para JiraIssue[]
  const completedIssues: JiraIssue[] = [];
  const spilledIssues: JiraIssue[] = [];

  for (const issue of sprintIssues) {
    const jiraIssue: JiraIssue = {
      key: issue.key,
      summary: issue.summary,
      issueType: issue.issueType,
      status: issue.status,
      created: issue.createdDate.toISOString(),
      resolutionDate: issue.resolutionDate?.toISOString(),
    };

    if (completedKeys.has(issue.key)) {
      completedIssues.push(jiraIssue);
    } else {
      spilledIssues.push(jiraIssue);
    }
  }

  // 5. Delegar ao cálculo existente
  // calculateSpillover(allSprintIssues_that_didnt_complete, completedIssues)
  // O primeiro parâmetro são as issues que NÃO concluíram (spilled)
  // O segundo são as que concluíram
  // committed = spilled.length + completed.length (total da sprint)
  return calculateSpillover(spilledIssues, completedIssues);
}
