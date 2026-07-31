/**
 * Sync status business logic helpers.
 * Provides higher-level functions for managing sync state per squad,
 * including status transitions (pending → success/error/partial) and
 * ghost-lock detection.
 */

import {
  selectSyncStatus,
  upsertSyncStatus,
  type SyncStatusRow,
} from "@/db/queries/sync-status";

/** Intervalo de sync em milissegundos (lido do env, default 15 min) */
const SYNC_INTERVAL_MS =
  parseInt(process.env.SYNC_INTERVAL_MINUTES || "15", 10) * 60_000;

/** Partial update fields accepted by updateSyncStatus */
export interface SyncStatusUpdate {
  lastSyncStart?: Date;
  lastSyncEnd?: Date;
  status?: "success" | "error" | "partial" | "pending";
  issuesSynced?: number;
  errorMessage?: string;
}

/**
 * Returns the sync_status record for a squad, or null if not found.
 */
export async function getSyncStatus(squadSlug: string): Promise<SyncStatusRow | null> {
  return selectSyncStatus(squadSlug);
}

/**
 * Upserts the sync_status record for a squad with partial updates.
 * Maps the business-level SyncStatusUpdate to DB column names.
 */
export async function updateSyncStatus(
  squadSlug: string,
  updates: SyncStatusUpdate
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};

  if (updates.lastSyncStart !== undefined) {
    dbUpdates.lastSyncStart = updates.lastSyncStart;
  }
  if (updates.lastSyncEnd !== undefined) {
    dbUpdates.lastSyncEnd = updates.lastSyncEnd;
  }
  if (updates.status !== undefined) {
    dbUpdates.lastSyncStatus = updates.status;
  }
  if (updates.issuesSynced !== undefined) {
    dbUpdates.issuesSyncedCount = updates.issuesSynced;
  }
  if (updates.errorMessage !== undefined) {
    // Truncate error message to 500 chars as per requirement 3.1
    dbUpdates.errorMessage =
      updates.errorMessage.length > 497
        ? updates.errorMessage.slice(0, 497) + "..."
        : updates.errorMessage;
  }

  await upsertSyncStatus(squadSlug, dbUpdates);
}

/**
 * Determines if a sync is currently in progress for the given squad.
 * Returns true if status is "pending" AND lastSyncStart is within the
 * last SYNC_INTERVAL window. This prevents ghost locks from stale pending
 * states if a sync worker crashed without completing.
 */
export async function isSyncInProgress(squadSlug: string): Promise<boolean> {
  const record = await selectSyncStatus(squadSlug);

  if (!record) return false;
  if (record.lastSyncStatus !== "pending") return false;
  if (!record.lastSyncStart) return false;

  const elapsed = Date.now() - record.lastSyncStart.getTime();
  return elapsed < SYNC_INTERVAL_MS;
}
