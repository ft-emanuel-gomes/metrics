/**
 * Sync module — re-exports key functions for external consumers.
 */

export { syncSquad, buildSyncJql } from "./sync-issues";
export type { SyncResult } from "./sync-issues";

export { syncSprints } from "./sync-sprints";

export {
  getSyncStatus,
  updateSyncStatus,
  isSyncInProgress,
} from "./sync-status";
export type { SyncStatusUpdate } from "./sync-status";
