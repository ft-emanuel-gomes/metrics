/**
 * Metrics Layer — DB-backed query functions index.
 * Re-exports all metric query functions and provides shared helper utilities
 * for staleness detection, cache TTL clamping, and empty-state handling.
 */

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { queryCycleTime } from "./cycle-time-db";
export { queryThroughput } from "./throughput-db";
export { queryFlowEfficiency } from "./flow-efficiency-db";
export { querySpillover } from "./spillover-db";
export { queryWipAging } from "./wip-aging-db";
export { queryOccupation, queryOccupationByDateRange } from "./occupation-db";
export { queryR2Progress } from "./r2-progress-db";
export { queryForecast } from "./forecast-db";

// ─── Helper Utilities ────────────────────────────────────────────────────────

/**
 * Determines if synced data is stale (last sync > 24 hours ago).
 * Returns true if lastSyncEnd is null (no sync has occurred).
 */
export function isDataStale(lastSyncEnd: Date | null): boolean {
  if (!lastSyncEnd) return true;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  return Date.now() - lastSyncEnd.getTime() > TWENTY_FOUR_HOURS;
}

/**
 * Clamps cache TTL to the valid range [60, 3600] seconds.
 * Values below 60 are raised to 60; values above 3600 are capped at 3600.
 */
export function clampCacheTtl(ttl: number): number {
  const MIN_TTL = 60;
  const MAX_TTL = 3600;
  if (ttl < MIN_TTL) return MIN_TTL;
  if (ttl > MAX_TTL) return MAX_TTL;
  return ttl;
}

/**
 * Gets the effective cache TTL from environment variable with clamping.
 * Reads CACHE_TTL_METRICS (default 300s) and clamps to [60, 3600].
 */
export function getMetricsCacheTtl(): number {
  const raw = parseInt(process.env.CACHE_TTL_METRICS || "300", 10);
  return clampCacheTtl(isNaN(raw) ? 300 : raw);
}
