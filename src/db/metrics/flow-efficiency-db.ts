/**
 * Flow Efficiency metric — DB-backed query function.
 * Replaces the Jira-direct path by querying completed issues + changelog_events from DB,
 * then delegating to the existing calculatePeriodFlowEfficiency pure function.
 *
 * Returns identical FlowEfficiencyPeriodResult as the Jira-direct path.
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues, changelogEvents } from "@/db/schema";
import { calculatePeriodFlowEfficiency } from "@/metrics/flow-efficiency";
import type { FlowEfficiencyPeriodResult } from "@/metrics/flow-efficiency";
import type { StatusTransition } from "@/services/jira-changelog";

const DONE_STATUSES = ["Concluído", "Done", "Closed", "Finalizado"];
const VALID_TYPES = ["História", "Story", "Bug", "Design", "Technical Debt", "Kaizen", "Task", "Spike"];

/**
 * Query flow efficiency from DB — replaces Jira-direct changelog fetch + calculation.
 * 
 * Logic:
 * 1. Query completed issues (DONE_STATUSES + VALID_TYPES + sprint filter)
 * 2. Fetch all changelog_events (status transitions) for those issues
 * 3. Group events by issue_key, build transitions array
 * 4. Delegate to calculatePeriodFlowEfficiency
 * 5. Return result directly
 */
export async function queryFlowEfficiency(
  project: string,
  sprintId: number | null,
  startDate: string,
  endDate: string
): Promise<FlowEfficiencyPeriodResult> {
  const { db } = getDatabase();

  // 1. Find completed issues in period with valid types
  const conditions = [
    eq(issues.project, project),
    inArray(issues.status, DONE_STATUSES),
    inArray(issues.issueType, VALID_TYPES),
  ];
  if (sprintId) {
    conditions.push(eq(issues.sprintId, sprintId));
  }

  const completedIssues = await db
    .select({ key: issues.key })
    .from(issues)
    .where(and(...conditions));

  if (completedIssues.length === 0) {
    return { efficiency: 0, issues: [] };
  }

  // 2. Fetch changelog events for these issues (status transitions only)
  const keys = completedIssues.map((i: { key: string }) => i.key);
  const events = await db
    .select()
    .from(changelogEvents)
    .where(
      and(
        inArray(changelogEvents.issueKey, keys),
        eq(changelogEvents.fieldName, "status")
      )
    )
    .orderBy(changelogEvents.timestamp);

  // 3. Group by issue and build transitions array
  const grouped = new Map<string, StatusTransition[]>();
  for (const evt of events) {
    if (!grouped.has(evt.issueKey)) {
      grouped.set(evt.issueKey, []);
    }
    grouped.get(evt.issueKey)!.push({
      timestamp: evt.timestamp.toISOString(),
      fromStatus: evt.fromStatus || "",
      toStatus: evt.toStatus,
    });
  }

  // 4. Build input for the pure calculation function
  const issuesWithChangelogs = keys.map((key: string) => ({
    key,
    transitions: grouped.get(key) || [],
  }));

  // 5. Delegate to existing pure calculation and return result
  return calculatePeriodFlowEfficiency(issuesWithChangelogs);
}
