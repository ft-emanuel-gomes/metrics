/**
 * Database query module for issues table.
 * Provides upsert and query functions using Drizzle ORM.
 */

import { eq, and, inArray, desc } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { issues } from "@/db/schema";

/** Insert type inferred from the issues table schema */
export type IssueInsert = typeof issues.$inferInsert;
/** Select type inferred from the issues table schema */
export type IssueRow = typeof issues.$inferSelect;

/**
 * Upserts a single issue record.
 * Uses ON CONFLICT DO UPDATE on the primary key (key) to update all fields.
 */
export async function upsertIssue(data: IssueInsert): Promise<void> {
  const { db } = getDatabase();
  await db.insert(issues).values(data).onConflictDoUpdate({
    target: issues.key,
    set: {
      project: data.project,
      summary: data.summary,
      issueType: data.issueType,
      status: data.status,
      createdDate: data.createdDate,
      resolutionDate: data.resolutionDate,
      sprintId: data.sprintId,
      boardId: data.boardId,
      originalEstimateSeconds: data.originalEstimateSeconds,
      fixVersion: data.fixVersion,
      teamFieldValue: data.teamFieldValue,
    },
  });
}

/**
 * Queries issues by project key, optionally filtering by status values.
 * Results ordered by created_date descending.
 */
export async function queryIssuesByProject(
  project: string,
  statusFilter?: string[]
): Promise<IssueRow[]> {
  const { db } = getDatabase();

  if (statusFilter && statusFilter.length > 0) {
    return db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.project, project),
          inArray(issues.status, statusFilter)
        )
      )
      .orderBy(desc(issues.createdDate));
  }

  return db
    .select()
    .from(issues)
    .where(eq(issues.project, project))
    .orderBy(desc(issues.createdDate));
}

/**
 * Queries issues by sprint ID, optionally filtering by issue types.
 * Results ordered by created_date descending.
 */
export async function queryIssuesBySprint(
  sprintId: number,
  issueTypes?: string[]
): Promise<IssueRow[]> {
  const { db } = getDatabase();

  if (issueTypes && issueTypes.length > 0) {
    return db
      .select()
      .from(issues)
      .where(
        and(
          eq(issues.sprintId, sprintId),
          inArray(issues.issueType, issueTypes)
        )
      )
      .orderBy(desc(issues.createdDate));
  }

  return db
    .select()
    .from(issues)
    .where(eq(issues.sprintId, sprintId))
    .orderBy(desc(issues.createdDate));
}

/**
 * Queries issues by their keys (batch lookup).
 * Returns all matching issues for the given set of keys.
 */
export async function queryIssuesByKeys(keys: string[]): Promise<IssueRow[]> {
  if (keys.length === 0) return [];

  const { db } = getDatabase();
  return db
    .select()
    .from(issues)
    .where(inArray(issues.key, keys));
}
