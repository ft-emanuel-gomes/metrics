/**
 * Sprint sync logic — fetches sprints from Jira Agile API and upserts into Data_Store.
 * Ensures the board record exists before inserting sprints (referential integrity).
 */

import { getJiraClient } from "@/services/jira-client";
import { getDatabase } from "@/db/connection";
import { boards } from "@/db/schema";
import { upsertSprint } from "@/db/queries/sprints";
import type { SquadConfig } from "@/config/squads";

// --- Jira API response types ---

interface JiraSprintResponse {
  maxResults: number;
  startAt: number;
  isLast: boolean;
  values: JiraSprint[];
}

interface JiraSprint {
  id: number;
  name: string;
  state: string; // "active" | "closed" | "future"
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

// --- Helper functions ---

/**
 * Maps squad methodology to board_type enum value.
 * "sprint" methodology → "scrum" board type
 * "kanban" methodology → "kanban" board type
 */
function mapBoardType(methodology: string): "scrum" | "kanban" {
  return methodology === "kanban" ? "kanban" : "scrum";
}

/**
 * Maps Jira sprint state string to the sprint_state enum.
 * Defaults to "future" for any unrecognized state.
 */
function mapSprintState(state: string): "active" | "closed" | "future" {
  const normalized = state.toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "closed") return "closed";
  return "future";
}

/**
 * Ensures the board record exists in the Data_Store before inserting sprints.
 * Uses ON CONFLICT DO UPDATE (upsert) so re-runs are idempotent.
 */
async function ensureBoardExists(squad: SquadConfig): Promise<void> {
  const { db } = getDatabase();

  await db.insert(boards).values({
    id: squad.boardId,
    projectKey: squad.project,
    name: squad.name,
    boardType: mapBoardType(squad.methodology),
  }).onConflictDoUpdate({
    target: boards.id,
    set: {
      projectKey: squad.project,
      name: squad.name,
      boardType: mapBoardType(squad.methodology),
    },
  });
}

/**
 * Syncs sprints for a squad's board from Jira Agile API into the Data_Store.
 *
 * Steps:
 * 1. Ensure board record exists (upsert) — satisfies FK constraint
 * 2. Fetch ALL sprints from Jira (all states) with pagination
 * 3. Upsert each sprint record with current state and dates
 *
 * @param squad - Squad configuration with boardId
 * @returns Number of sprints synced
 */
export async function syncSprints(squad: SquadConfig): Promise<number> {
  // 1. Ensure board exists (upsert) — must happen before sprint inserts
  await ensureBoardExists(squad);

  // 2. Boards Kanban não suportam sprints — apenas garantir que o board existe
  if (squad.methodology === "kanban") {
    return 0;
  }

  // 3. Fetch all sprints from Jira (paginated)
  const client = getJiraClient();
  const allSprints: JiraSprint[] = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    const response = await client.get<JiraSprintResponse>(
      `/rest/agile/1.0/board/${squad.boardId}/sprint`,
      { startAt, maxResults: 50 }
    );
    allSprints.push(...response.values);
    isLast = response.isLast;
    startAt += response.values.length;
  }

  // 4. Upsert each sprint into the Data_Store
  for (const sprint of allSprints) {
    await upsertSprint({
      id: sprint.id,
      boardId: squad.boardId,
      name: sprint.name,
      state: mapSprintState(sprint.state),
      startDate: sprint.startDate ? new Date(sprint.startDate) : new Date(),
      endDate: sprint.endDate ? new Date(sprint.endDate) : new Date(),
      completeDate: sprint.completeDate ? new Date(sprint.completeDate) : null,
    });
  }

  return allSprints.length;
}
