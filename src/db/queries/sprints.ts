/**
 * Database query module for sprints table.
 * Provides upsert and query functions using Drizzle ORM.
 */

import { eq, and } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { sprints } from "@/db/schema";

/** Insert type inferred from the sprints table schema */
export type SprintInsert = typeof sprints.$inferInsert;
/** Select type inferred from the sprints table schema */
export type SprintRow = typeof sprints.$inferSelect;

/**
 * Upserts a single sprint record.
 * Uses ON CONFLICT DO UPDATE on the primary key (id) to update all fields.
 */
export async function upsertSprint(data: SprintInsert): Promise<void> {
  const { db } = getDatabase();
  await db.insert(sprints).values(data).onConflictDoUpdate({
    target: sprints.id,
    set: {
      boardId: data.boardId,
      name: data.name,
      state: data.state,
      startDate: data.startDate,
      endDate: data.endDate,
      completeDate: data.completeDate,
    },
  });
}

/**
 * Queries sprints by board ID, optionally filtering by state.
 * Results ordered by start_date descending (most recent first).
 */
export async function querySprintsByBoard(
  boardId: number,
  state?: string
): Promise<SprintRow[]> {
  const { db } = getDatabase();

  if (state) {
    return db
      .select()
      .from(sprints)
      .where(
        and(
          eq(sprints.boardId, boardId),
          eq(sprints.state, state as "active" | "closed" | "future")
        )
      )
      .orderBy(sprints.startDate);
  }

  return db
    .select()
    .from(sprints)
    .where(eq(sprints.boardId, boardId))
    .orderBy(sprints.startDate);
}

/**
 * Queries a single sprint by its ID.
 * Returns null if not found.
 */
export async function querySprintById(
  id: number
): Promise<SprintRow | null> {
  const { db } = getDatabase();
  const results = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, id))
    .limit(1);

  return results[0] ?? null;
}
