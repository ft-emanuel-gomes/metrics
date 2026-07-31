/**
 * Cycle Time P85 metric — DB-backed implementation.
 * Replaces fetchCompletedIssuesWithChangelogs + calculateCycleTimeP85 Jira-direct path.
 * Queries completed issues and their changelog events from the Data_Store,
 * then delegates calculation to the existing pure function.
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues, changelogEvents } from "@/db/schema";
import { calculateCycleTimeP85 } from "@/metrics/cycle-time";
import type { CycleTimePeriodResult } from "@/metrics/cycle-time";
import type { StatusTransition } from "@/services/jira-changelog";

// Status considerados como "concluído" para filtrar issues finalizadas
const DONE_STATUSES = ["Concluído", "Done", "Closed", "Finalizado"];

// Tipos válidos para cálculo de Cycle Time (exclui subtasks)
const VALID_TYPES = ["História", "Story", "Bug", "Design", "Technical Debt", "Kaizen", "Task", "Spike"];

/**
 * Queries cycle time P85 from the Data_Store.
 * Returns identical CycleTimePeriodResult as the Jira-direct path.
 *
 * - Filters completed issues by project, DONE_STATUSES, VALID_TYPES
 * - Optionally scopes to a specific sprint
 * - Fetches all status changelog events for matching issues
 * - Delegates P85 calculation to existing `calculateCycleTimeP85` pure function
 * - Excludes reverted cards (already handled by status filter — only issues
 *   with current status IN DONE_STATUSES are selected)
 */
export async function queryCycleTime(
  project: string,
  sprintId: number | null,
  startDate: string,
  endDate: string
): Promise<CycleTimePeriodResult> {
  const { db } = getDatabase();

  // 1. Find completed issues in period
  const conditions = [
    eq(issues.project, project),
    inArray(issues.status, DONE_STATUSES),
    inArray(issues.issueType, VALID_TYPES),
  ];
  if (sprintId) conditions.push(eq(issues.sprintId, sprintId));

  const completedIssues = await db.select({ key: issues.key })
    .from(issues)
    .where(and(...conditions));

  if (completedIssues.length === 0) {
    return { p85: null, issueCount: 0, issues: [] };
  }

  // 2. Fetch changelog events for these issues (only status transitions)
  const keys = completedIssues.map((i: { key: string }) => i.key);
  const events = await db.select()
    .from(changelogEvents)
    .where(and(
      inArray(changelogEvents.issueKey, keys),
      eq(changelogEvents.fieldName, "status")
    ))
    .orderBy(changelogEvents.timestamp);

  // 3. Group by issue and build transitions
  const grouped = new Map<string, StatusTransition[]>();
  for (const evt of events) {
    if (!grouped.has(evt.issueKey)) grouped.set(evt.issueKey, []);
    grouped.get(evt.issueKey)!.push({
      timestamp: evt.timestamp.toISOString(),
      fromStatus: evt.fromStatus || "",
      toStatus: evt.toStatus,
    });
  }

  // 4. Delegate to existing pure calculation function
  const issuesWithChangelogs = keys.map((key: string) => ({
    key,
    transitions: grouped.get(key) || [],
  }));

  return calculateCycleTimeP85(issuesWithChangelogs);
}
