/**
 * Throughput metric — DB-backed implementation.
 * Replaces fetchCompletedIssues/fetchCompletedIssuesWithChangelogs + calculateThroughput Jira-direct path.
 * Queries issues that transitioned to Concluído during the period from the Data_Store,
 * applies status and type filters, then delegates calculation to the existing pure function.
 */

import { eq, and, inArray, between } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues, changelogEvents } from "@/db/schema";
import { calculateThroughput } from "@/metrics/throughput";
import type { ThroughputPeriodResult } from "@/metrics/throughput";
import type { JiraIssue } from "@/services/jira-search";

// Status considerados como "concluído" — issue precisa ter status ATUAL nesta lista
const DONE_STATUSES = ["Concluído", "Done", "Closed", "Finalizado"];

// Tipos válidos para cálculo de Throughput
const VALID_TYPES = ["História", "Story", "Bug", "Design", "Technical Debt", "Kaizen", "Task", "Spike"];

// Status excluídos — issues com estes status NUNCA contam como vazão
const EXCLUDED_STATUSES = ["Cancelado", "CANCELADO", "Rejeitado"];

/**
 * Queries throughput from the Data_Store.
 * Returns identical ThroughputPeriodResult as the Jira-direct path.
 *
 * Logic:
 * 1. If sprintId is provided: query issues in that sprint with current status in DONE_STATUSES
 * 2. If sprintId is null (kanban): query issues that have a changelog event transitioning
 *    to Concluído/Done within the date range, and current status is in DONE_STATUSES
 * 3. Exclude issues with status in EXCLUDED_STATUSES
 * 4. Filter by VALID_TYPES
 * 5. Map to JiraIssue[] format and delegate to calculateThroughput()
 */
export async function queryThroughput(
  project: string,
  sprintId: number | null,
  startDate: string,
  endDate: string
): Promise<ThroughputPeriodResult> {
  const { db } = getDatabase();

  let matchingIssues: { key: string; summary: string; issueType: string; status: string; createdDate: Date; resolutionDate: Date | null }[];

  if (sprintId) {
    // Sprint mode: issues in the sprint with current status = Concluído
    const conditions = [
      eq(issues.project, project),
      eq(issues.sprintId, sprintId),
      inArray(issues.status, DONE_STATUSES),
      inArray(issues.issueType, VALID_TYPES),
    ];

    matchingIssues = await db
      .select({
        key: issues.key,
        summary: issues.summary,
        issueType: issues.issueType,
        status: issues.status,
        createdDate: issues.createdDate,
        resolutionDate: issues.resolutionDate,
      })
      .from(issues)
      .where(and(...conditions));
  } else {
    // Kanban mode: issues that transitioned to Concluído/Done DURING the date range
    // AND whose current status is in DONE_STATUSES
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Find issue keys that have a changelog event to a done status within the date range
    const transitionedKeys = await db
      .selectDistinct({ issueKey: changelogEvents.issueKey })
      .from(changelogEvents)
      .where(and(
        inArray(changelogEvents.toStatus, DONE_STATUSES),
        between(changelogEvents.timestamp, start, end),
        eq(changelogEvents.fieldName, "status")
      ));

    if (transitionedKeys.length === 0) {
      return { total: 0, byType: [] };
    }

    const keys = transitionedKeys.map((r: { issueKey: string }) => r.issueKey);

    // Now query the actual issues with all filters
    matchingIssues = await db
      .select({
        key: issues.key,
        summary: issues.summary,
        issueType: issues.issueType,
        status: issues.status,
        createdDate: issues.createdDate,
        resolutionDate: issues.resolutionDate,
      })
      .from(issues)
      .where(and(
        eq(issues.project, project),
        inArray(issues.key, keys),
        inArray(issues.status, DONE_STATUSES),
        inArray(issues.issueType, VALID_TYPES),
      ));
  }

  // Exclude cancelled/rejected issues (safety filter — they shouldn't have DONE status,
  // but this ensures consistency with the business rules)
  const filteredIssues = matchingIssues.filter(
    (issue) => !EXCLUDED_STATUSES.includes(issue.status)
  );

  if (filteredIssues.length === 0) {
    return { total: 0, byType: [] };
  }

  // Map to JiraIssue[] format expected by calculateThroughput
  const jiraIssues: JiraIssue[] = filteredIssues.map((issue) => ({
    key: issue.key,
    summary: issue.summary,
    issueType: issue.issueType,
    status: issue.status,
    created: issue.createdDate.toISOString(),
    resolutionDate: issue.resolutionDate?.toISOString(),
  }));

  // Delegate to existing pure calculation function
  return calculateThroughput(jiraIssues);
}
