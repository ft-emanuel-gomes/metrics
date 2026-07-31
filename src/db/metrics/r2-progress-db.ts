/**
 * R2 Progress metric — DB-backed implementation.
 * Replaces fetchR2Epics + fetchR2Features Jira-direct path.
 * Queries epics and features filtered by fix_version and team_field_value from the Data_Store,
 * maps to JiraIssue[] format, and delegates calculation to the existing pure function.
 */

import { eq, and } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues } from "@/db/schema";
import { calculateR2Progress } from "@/metrics/r2-progress";
import type { R2ProgressResult } from "@/metrics/r2-progress";
import type { JiraIssue } from "@/services/jira-search";

/**
 * Queries R2 progress from the Data_Store.
 * Returns identical R2ProgressResult as the Jira-direct path.
 *
 * Logic:
 * 1. Query epics: issues WHERE project = "EP" AND issue_type = "Epic" AND fix_version = fixVersion AND team_field_value = teamFieldValue
 * 2. Query features: issues WHERE project = "FT" AND fix_version = fixVersion AND team_field_value = teamFieldValue
 * 3. Map both to JiraIssue[] format
 * 4. Delegate to calculateR2Progress(epics, features, deadline, releaseName)
 */
export async function queryR2Progress(
  fixVersion: string,
  teamFieldValue: string,
  deadline: string,
  releaseName: string
): Promise<R2ProgressResult> {
  const { db } = getDatabase();

  // 1. Query epics from DB
  const epicRows = await db
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
      eq(issues.project, "EP"),
      eq(issues.issueType, "Epic"),
      eq(issues.fixVersion, fixVersion),
      eq(issues.teamFieldValue, teamFieldValue)
    ));

  // 2. Query features from DB
  const featureRows = await db
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
      eq(issues.project, "FT"),
      eq(issues.fixVersion, fixVersion),
      eq(issues.teamFieldValue, teamFieldValue)
    ));

  // 3. Map to JiraIssue[] format
  const epics: JiraIssue[] = epicRows.map((row: { key: string; summary: string; issueType: string; status: string; createdDate: Date; resolutionDate: Date | null }) => ({
    key: row.key,
    summary: row.summary,
    issueType: row.issueType,
    status: row.status,
    created: row.createdDate.toISOString(),
    resolutionDate: row.resolutionDate?.toISOString(),
  }));

  const features: JiraIssue[] = featureRows.map((row: { key: string; summary: string; issueType: string; status: string; createdDate: Date; resolutionDate: Date | null }) => ({
    key: row.key,
    summary: row.summary,
    issueType: row.issueType,
    status: row.status,
    created: row.createdDate.toISOString(),
    resolutionDate: row.resolutionDate?.toISOString(),
  }));

  // 4. Delegate to existing pure calculation function
  return calculateR2Progress(epics, features, deadline, releaseName);
}
