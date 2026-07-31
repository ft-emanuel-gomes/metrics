import { NextResponse } from "next/server";
import { getCacheManager } from "@/cache/cache-manager";
import { getAllSquads } from "@/config/squads";

export async function GET() {
  const cache = getCacheManager();
  const stats = cache.stats();

  // If DATABASE_PROVIDER is not configured, return simple health check (backward compatibility)
  const databaseProvider = process.env.DATABASE_PROVIDER;
  if (!databaseProvider) {
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      cache: {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
      },
      uptime: process.uptime(),
    });
  }

  // DB-backed health check with sync status for all squads
  const { getDatabase } = await import("@/db/connection");
  const { selectAllSyncStatuses } = await import("@/db/queries/sync-status");

  const { ping } = getDatabase();
  const dbHealthy = await ping();

  const statuses = await selectAllSyncStatuses();

  const allSquads = getAllSquads();
  const syncStatuses = allSquads.map((squad) => {
    const status = statuses.find((s) => s.squadSlug === squad.slug);
    return {
      squad_slug: squad.slug,
      last_sync_end: status?.lastSyncEnd?.toISOString() ?? null,
      last_sync_status: status?.lastSyncStatus ?? "pending",
      issues_synced_count: status?.issuesSyncedCount ?? 0,
    };
  });

  return NextResponse.json(
    {
      status: dbHealthy ? "healthy" : "degraded",
      database: dbHealthy ? "connected" : "unavailable",
      sync_statuses: syncStatuses,
      cache: {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
      },
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    { status: 200 }
  );
}
