/**
 * POST /api/sync/full-resync
 *
 * Triggers a full resync for a specific squad (fire-and-forget).
 * Returns 202 Accepted immediately without waiting for sync to complete.
 */

import { NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { syncSquad } from "@/sync/sync-issues";
import { syncSprints } from "@/sync/sync-sprints";

export async function POST(request: Request) {
  const body = await request.json();
  const { squadSlug } = body;

  // Validate squad exists
  const squad = getSquadBySlug(squadSlug);
  if (!squad) {
    return NextResponse.json(
      { error: "Squad not found", squadSlug },
      { status: 404 }
    );
  }

  // Trigger full resync asynchronously (fire-and-forget)
  // Don't await — return immediately with 202
  Promise.resolve()
    .then(async () => {
      await syncSprints(squad);
      await syncSquad(squad, { incremental: false });
    })
    .catch((err) => {
      console.error(`[FullResync] Error for ${squadSlug}:`, err);
    });

  return NextResponse.json(
    {
      message: `Full resync triggered for ${squadSlug}`,
      timestamp: new Date().toISOString(),
    },
    { status: 202 }
  );
}
