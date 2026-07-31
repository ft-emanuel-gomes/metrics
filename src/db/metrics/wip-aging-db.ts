/**
 * WIP Aging metric computed from the local database.
 * Replaces the Jira-direct path for Kanban squads.
 *
 * Logic:
 * 1. Query issues in WIP statuses from DB
 * 2. For each WIP issue, find the most recent changelog_event (last status transition)
 * 3. Compute daysSinceLastTransition per issue
 * 4. Delegate to existing calculateWipAging pure function
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues, changelogEvents } from "@/db/schema";
import { calculateWipAging, type WipAgingResult } from "@/metrics/wip-aging";
import { WIP_STATUSES, VALID_ISSUE_TYPES } from "@/config/status-mapping";
import type { StatusTransition } from "@/services/jira-changelog";

/**
 * Queries WIP aging from the local database.
 * Fetches issues currently in WIP statuses, retrieves their changelog events,
 * and delegates to the existing calculateWipAging pure function.
 *
 * @param project - Jira project key (e.g., "RI", "RF")
 * @returns WipAgingResult with buckets, issues, and totalWip
 */
export async function queryWipAging(
  project: string
): Promise<WipAgingResult> {
  const { db } = getDatabase();

  const wipStatusArray = Array.from(WIP_STATUSES);

  // 1. Query issues in WIP statuses for the given project
  const wipIssues = await db
    .select({
      key: issues.key,
      summary: issues.summary,
      status: issues.status,
    })
    .from(issues)
    .where(
      and(
        eq(issues.project, project),
        inArray(issues.status, wipStatusArray),
        inArray(issues.issueType, VALID_ISSUE_TYPES)
      )
    );

  // Empty state: return valid result with zero counts
  if (wipIssues.length === 0) {
    return calculateWipAging([]);
  }

  // 2. Fetch changelog events for all WIP issues (status transitions only)
  const issueKeys = wipIssues.map((i: { key: string }) => i.key);
  const events = await db
    .select({
      issueKey: changelogEvents.issueKey,
      timestamp: changelogEvents.timestamp,
      fromStatus: changelogEvents.fromStatus,
      toStatus: changelogEvents.toStatus,
    })
    .from(changelogEvents)
    .where(
      and(
        inArray(changelogEvents.issueKey, issueKeys),
        eq(changelogEvents.fieldName, "status")
      )
    )
    .orderBy(changelogEvents.timestamp);

  // 3. Group changelog events by issue key
  const changelogByIssue = new Map<string, StatusTransition[]>();
  for (const evt of events) {
    if (!changelogByIssue.has(evt.issueKey)) {
      changelogByIssue.set(evt.issueKey, []);
    }
    changelogByIssue.get(evt.issueKey)!.push({
      timestamp: evt.timestamp.toISOString(),
      fromStatus: evt.fromStatus || "",
      toStatus: evt.toStatus,
    });
  }

  // 4. Build input for the pure calculation function
  const issuesWithTransitions = wipIssues.map((issue: { key: string; summary: string; status: string }) => ({
    key: issue.key,
    summary: issue.summary,
    status: issue.status,
    transitions: changelogByIssue.get(issue.key) || [],
  }));

  // 5. Delegate to existing pure function
  return calculateWipAging(issuesWithTransitions);
}
