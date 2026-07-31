/**
 * Sync Worker — Main entry point for the sync container.
 *
 * Responsibilities:
 * 1. Run database migrations on startup
 * 2. Detect empty DB → trigger Full_Resync for all squads
 * 3. Start incremental sync loop with configurable interval (SYNC_INTERVAL_MINUTES)
 * 4. Skip squad if sync already in progress
 * 5. Support FORCE_FULL_RESYNC=true env flag
 *
 * Requirements: 2.1, 2.9, 2.10, 2.11, 11.4
 */

import { runMigrations } from "@/db/migrate";
import { getAllSquads, type SquadConfig } from "@/config/squads";
import { syncSquad, purgeExpiredData } from "./sync-issues";
import { syncSprints } from "./sync-sprints";
import { getSyncStatus, isSyncInProgress } from "./sync-status";

// --- Configuration ---

/** Sync interval in milliseconds (default: 15 minutes) */
const SYNC_INTERVAL =
  parseInt(process.env.SYNC_INTERVAL_MINUTES || "15", 10) * 60_000;

/** Force full resync on startup (overrides incremental detection) */
const FORCE_FULL = process.env.FORCE_FULL_RESYNC === "true";

// --- Main Entry Point ---

/**
 * Main function — orchestrates the sync worker lifecycle.
 *
 * Startup sequence:
 * 1. Run migrations (idempotent)
 * 2. For each squad: if no sync record exists OR FORCE_FULL_RESYNC=true → full resync
 * 3. Start periodic incremental sync loop
 */
async function main(): Promise<void> {
  console.log("[SyncWorker] Starting sync worker...");

  // 1. Run migrations on startup (Req 11.4)
  await runMigrations();

  // 2. Check if first run (empty DB) → full resync (Req 2.11)
  const squads = getAllSquads();

  for (const squad of squads) {
    const status = await getSyncStatus(squad.slug);

    if (!status || FORCE_FULL) {
      const mode = !status ? "first_run" : "force_full";
      console.log(
        JSON.stringify({
          event: "sync_start",
          squad_slug: squad.slug,
          timestamp: new Date().toISOString(),
          mode,
        })
      );

      await performFullResync(squad);
    }
  }

  // 3. Start incremental sync loop (Req 2.1)
  setInterval(() => runIncrementalCycle(), SYNC_INTERVAL);
  console.log(
    `[SyncWorker] Sync loop started. Interval: ${SYNC_INTERVAL / 60_000}min`
  );
}

// --- Full Resync ---

/**
 * Performs a full resync for a single squad: syncs sprints first, then all issues.
 * Used on first startup (empty DB) or when FORCE_FULL_RESYNC=true.
 */
async function performFullResync(squad: SquadConfig): Promise<void> {
  try {
    // Sync sprints first (board + sprint records must exist for FK refs)
    const sprintCount = await syncSprints(squad);
    console.log(
      JSON.stringify({
        event: "sprints_synced",
        squad_slug: squad.slug,
        timestamp: new Date().toISOString(),
        sprints_count: sprintCount,
      })
    );

    // Full issue sync (incremental: false → fetches ALL issues)
    await syncSquad(squad, { incremental: false });
  } catch (error) {
    // Log error but continue with next squad (Req 2.8 — fault isolation)
    console.error(
      JSON.stringify({
        event: "full_resync_error",
        squad_slug: squad.slug,
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
      })
    );
  }
}

// --- Incremental Sync Cycle ---

/**
 * Executes one incremental sync cycle across all squads.
 * Skips squads that already have a sync in progress (Req 2.10).
 */
async function runIncrementalCycle(): Promise<void> {
  const squads = getAllSquads();

  for (const squad of squads) {
    // Skip if sync already in progress (Req 2.10)
    if (await isSyncInProgress(squad.slug)) {
      console.warn(
        JSON.stringify({
          event: "sync_skip",
          squad_slug: squad.slug,
          timestamp: new Date().toISOString(),
          reason: "already_in_progress",
        })
      );
      continue;
    }

    try {
      // Expurgo: remover dados mais antigos que 90 dias (Regra de retenção)
      await purgeExpiredData(squad.project);

      // Sync sprints (updates states, picks up newly closed sprints)
      await syncSprints(squad);

      // Incremental issue sync (updated >= last_sync_timestamp)
      await syncSquad(squad, { incremental: true });
    } catch (error) {
      // Error already logged inside syncSquad; continue with next squad (Req 2.8)
      console.error(
        JSON.stringify({
          event: "incremental_sync_error",
          squad_slug: squad.slug,
          timestamp: new Date().toISOString(),
          error: (error as Error).message,
        })
      );
    }
  }
}

// --- Export for testing ---

export { main, performFullResync, runIncrementalCycle };

// --- Start the worker ---
main().catch((error) => {
  console.error("[SyncWorker] Fatal error:", error);
  process.exit(1);
});
