/**
 * Forecast Upstream metric — DB-backed implementation.
 * Replaces the Jira-direct path that fetches R2 epics/features → changelogs → calculateForecast().
 * Queries R2 items and their changelog events from the Data_Store,
 * then delegates calculation to the existing pure function.
 */

import { eq, and, or, inArray } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues, changelogEvents } from "@/db/schema";
import { calculateForecast } from "@/metrics/forecast";
import type { ForecastResult, R2ItemWithChangelog } from "@/metrics/forecast";
import type { StatusTransition } from "@/services/jira-changelog";

// Projetos R2: Épicos (EP) e Features (FT)
const R2_PROJECTS = ["EP", "FT"];

/**
 * Queries forecast from the Data_Store.
 * Returns identical ForecastResult as the Jira-direct path.
 *
 * Logic:
 * 1. Query R2 items (project EP or FT) filtered by fixVersion and teamFieldValue
 * 2. Fetch all status changelog events for those issues
 * 3. Group events by issue key, build R2ItemWithChangelog[]
 * 4. Delegate to existing `calculateForecast` pure function
 *
 * @param fixVersion - R2 fix version string (e.g. "R2 - COMPLIANCE, ONBOARDING E FEE-BASED")
 * @param teamFieldValue - "Monte Bravo Teams" field value for the squad
 */
export async function queryForecast(
  fixVersion: string,
  teamFieldValue: string
): Promise<ForecastResult> {
  const { db } = getDatabase();

  // 1. Query R2 items from DB: epics and features with matching fix_version and team
  const r2Issues = await db
    .select({
      key: issues.key,
      issueType: issues.issueType,
      status: issues.status,
    })
    .from(issues)
    .where(
      and(
        or(
          ...R2_PROJECTS.map((p) => eq(issues.project, p))
        ),
        eq(issues.fixVersion, fixVersion),
        eq(issues.teamFieldValue, teamFieldValue)
      )
    );

  // Empty state: return valid result with null P85 values
  if (r2Issues.length === 0) {
    return {
      epic: { type: "Épico", p85Days: null, sampleSize: 0 },
      feature: { type: "Feature", p85Days: null, sampleSize: 0 },
      story: { type: "História", p85Days: null, sampleSize: 0 },
    };
  }

  // 2. Fetch changelog events for those issue keys (status transitions only)
  const keys = r2Issues.map((i: { key: string }) => i.key);
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

  // 3. Group events by issue key and build transitions
  const grouped = new Map<string, StatusTransition[]>();
  for (const evt of events) {
    if (!grouped.has(evt.issueKey)) grouped.set(evt.issueKey, []);
    grouped.get(evt.issueKey)!.push({
      timestamp: evt.timestamp.toISOString(),
      fromStatus: evt.fromStatus || "",
      toStatus: evt.toStatus,
    });
  }

  // 4. Build R2ItemWithChangelog[] and delegate to pure calculation
  const r2WithChangelogs: R2ItemWithChangelog[] = r2Issues.map(
    (issue: { key: string; issueType: string; status: string }) => ({
      key: issue.key,
      issueType: issue.issueType,
      status: issue.status,
      transitions: grouped.get(issue.key) || [],
    })
  );

  return calculateForecast(r2WithChangelogs);
}
