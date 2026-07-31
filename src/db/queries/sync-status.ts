/**
 * Database CRUD operations for the sync_status table.
 * Provides low-level data access for sync status tracking per squad.
 */

import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { syncStatus } from "@/db/schema";

/** Type representing a sync_status row as returned from the database */
export type SyncStatusRow = typeof syncStatus.$inferSelect;

/** Type representing the insertable fields for sync_status */
export type SyncStatusInsert = typeof syncStatus.$inferInsert;

/**
 * Fetches the sync_status record for a given squad slug.
 * Returns null if no record exists (squad never synced).
 */
export async function selectSyncStatus(squadSlug: string): Promise<SyncStatusRow | null> {
  const { db } = getDatabase();

  const rows = await db
    .select()
    .from(syncStatus)
    .where(eq(syncStatus.squadSlug, squadSlug))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Fetches sync_status records for all squads.
 * Returns an empty array if no records exist.
 */
export async function selectAllSyncStatuses(): Promise<SyncStatusRow[]> {
  const { db } = getDatabase();
  return db.select().from(syncStatus);
}

/**
 * Upserts a sync_status record for the given squad.
 * If the record exists, updates only the provided fields.
 * If it doesn't exist, inserts a new record with defaults for unspecified fields.
 */
export async function upsertSyncStatus(
  squadSlug: string,
  updates: Partial<Omit<SyncStatusInsert, "squadSlug">>
): Promise<void> {
  const { db } = getDatabase();

  await db
    .insert(syncStatus)
    .values({
      squadSlug,
      ...updates,
    })
    .onConflictDoUpdate({
      target: syncStatus.squadSlug,
      set: updates,
    });
}
