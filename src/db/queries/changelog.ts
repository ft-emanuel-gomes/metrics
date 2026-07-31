/**
 * Database query module for changelog_events table.
 * Provides batch insert, delete, and query functions using Drizzle ORM.
 */

import { eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { changelogEvents } from "@/db/schema";

/** Insert type inferred from the changelog_events table schema */
export type ChangelogInsert = typeof changelogEvents.$inferInsert;
/** Select type inferred from the changelog_events table schema */
export type ChangelogRow = typeof changelogEvents.$inferSelect;

/**
 * Batch inserts changelog events.
 * Uses ON CONFLICT DO NOTHING for idempotent inserts — duplicate
 * (issue_key, timestamp, to_status) tuples are silently ignored.
 */
export async function insertChangelogEvents(
  events: ChangelogInsert[]
): Promise<void> {
  if (events.length === 0) return;

  const { db } = getDatabase();
  await db
    .insert(changelogEvents)
    .values(events)
    .onConflictDoNothing({
      target: [
        changelogEvents.issueKey,
        changelogEvents.timestamp,
        changelogEvents.toStatus,
      ],
    });
}

/**
 * Deletes all changelog events for a given issue key.
 * Used during full resync to replace changelog events atomically.
 */
export async function deleteChangelogByIssueKey(
  issueKey: string
): Promise<void> {
  const { db } = getDatabase();
  await db
    .delete(changelogEvents)
    .where(eq(changelogEvents.issueKey, issueKey));
}

/**
 * Queries changelog events for multiple issue keys (batch).
 * Results ordered by timestamp ascending for chronological processing.
 */
export async function queryChangelogByIssueKeys(
  keys: string[]
): Promise<ChangelogRow[]> {
  if (keys.length === 0) return [];

  const { db } = getDatabase();
  return db
    .select()
    .from(changelogEvents)
    .where(inArray(changelogEvents.issueKey, keys))
    .orderBy(changelogEvents.timestamp);
}

/**
 * Queries changelog events for a single issue key.
 * Results ordered by timestamp ascending for chronological processing.
 */
export async function queryChangelogByIssueKey(
  key: string
): Promise<ChangelogRow[]> {
  const { db } = getDatabase();
  return db
    .select()
    .from(changelogEvents)
    .where(eq(changelogEvents.issueKey, key))
    .orderBy(changelogEvents.timestamp);
}
