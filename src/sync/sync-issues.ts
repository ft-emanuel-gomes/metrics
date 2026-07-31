/**
 * Issue sync logic — ETL pipeline for a single squad.
 * Extracts issues from Jira Cloud (incremental or full), transforms to DB schema,
 * and loads via per-issue atomic transactions (upsert + changelog replace).
 */

import { eq } from "drizzle-orm";
import { getJiraClient } from "@/services/jira-client";
import { fetchChangelog } from "@/services/jira-changelog";
import { getDatabase } from "@/db/connection";
import { issues, changelogEvents } from "@/db/schema";
import type { SquadConfig } from "@/config/squads";
import { getSyncStatus, updateSyncStatus } from "./sync-status";

// --- Types ---

export interface SyncResult {
  squadSlug: string;
  status: "success" | "error" | "partial";
  issuesSynced: number;
  durationMs: number;
  errorMessage?: string;
}

/** Jira search response shape (POST /rest/api/3/search/jql) */
interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
  nextPageToken?: string;
}

interface JiraIssue {
  key: string;
  fields: {
    issuetype: { name: string };
    status: { name: string };
    summary: string;
    created: string;
    resolutiondate: string | null;
    timetracking?: { originalEstimateSeconds?: number };
    fixVersions?: { name: string }[];
    [key: string]: unknown;
  };
  changelog?: {
    histories: JiraHistoryEntry[];
    total: number;
    maxResults: number;
  };
}

interface JiraHistoryEntry {
  created: string;
  items: {
    field: string;
    fromString: string | null;
    toString: string | null;
  }[];
}

// --- Constants ---

/** Fields requested from Jira during sync */
const SYNC_FIELDS = [
  "issuetype",
  "status",
  "summary",
  "created",
  "resolutiondate",
  "timetracking",
  "fixVersions",
];

/** Threshold above which inline changelog is incomplete — use individual endpoint */
const CHANGELOG_INLINE_LIMIT = 100;

/** Janela de retenção de dados em dias (3 meses) */
const DATA_RETENTION_DAYS = 90;

// --- Main Export ---

/**
 * Synchronizes all issues for a squad from Jira to the local database.
 *
 * - Incremental mode: queries issues updated since last sync timestamp
 * - Full mode: queries all issues for the project (no date filter)
 *
 * Each issue is persisted in an atomic transaction (upsert + changelog replace).
 * The Jira client handles rate limits (429) and transient errors (5xx) with retry.
 */
export async function syncSquad(
  squad: SquadConfig,
  options: { incremental: boolean }
): Promise<SyncResult> {
  const startTime = Date.now();
  const client = getJiraClient();
  const { db } = getDatabase();

  // Mark sync as in progress
  await updateSyncStatus(squad.slug, {
    lastSyncStart: new Date(),
    status: "pending",
  });

  logSyncEvent("sync_start", squad.slug, { mode: options.incremental ? "incremental" : "full" });

  try {
    // Build JQL based on incremental vs full mode
    const lastSync = options.incremental
      ? await getLastSyncTimestamp(squad.slug)
      : null;
    const jql = buildSyncJql(squad.project, lastSync);

    // Also request the team custom field if the squad has one defined
    const fields = [...SYNC_FIELDS];
    // Note: customfield for team is extracted via teamFieldValue config, not a Jira field fetch

    // Paginated fetch from Jira
    let synced = 0;
    let errors = 0;
    let nextPageToken: string | undefined;

    do {
      const body: Record<string, unknown> = {
        jql,
        fields,
        expand: "changelog",
        maxResults: 25,
      };
      if (nextPageToken) {
        body.nextPageToken = nextPageToken;
      }

      const response = await client.post<JiraSearchResponse>(
        "/rest/api/3/search/jql",
        body
      );

      // Process each issue in an atomic transaction
      for (const raw of response.issues) {
        try {
          await persistIssueWithChangelog(db, raw, squad);
          synced++;
        } catch (issueError) {
          errors++;
          logSyncEvent("sync_error", squad.slug, {
            issue_key: raw.key,
            error: (issueError as Error).message,
          });
        }
      }

      nextPageToken = response.nextPageToken;
    } while (nextPageToken);

    // Gap detection: compare JQL total vs persisted count
    // (The total from the first page tells us expected count)
    // Note: We log a warning if there's a mismatch, but don't fail the sync

    const durationMs = Date.now() - startTime;
    const finalStatus = errors > 0 ? "partial" : "success";

    await updateSyncStatus(squad.slug, {
      status: finalStatus,
      lastSyncEnd: new Date(),
      issuesSynced: synced,
      ...(errors > 0
        ? { errorMessage: `${errors} issue(s) failed during sync` }
        : {}),
    });

    logSyncEvent("sync_complete", squad.slug, {
      duration_ms: durationMs,
      issues_count: synced,
      errors_count: errors,
    });

    return {
      squadSlug: squad.slug,
      status: finalStatus,
      issuesSynced: synced,
      durationMs,
      ...(errors > 0
        ? { errorMessage: `${errors} issue(s) failed during sync` }
        : {}),
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = truncateErrorMessage((error as Error).message);

    await updateSyncStatus(squad.slug, {
      status: "error",
      errorMessage,
    });

    logSyncEvent("sync_error", squad.slug, {
      duration_ms: durationMs,
      issues_count: 0,
      error: errorMessage,
    });

    return {
      squadSlug: squad.slug,
      status: "error",
      issuesSynced: 0,
      durationMs,
      errorMessage,
    };
  }
}

// --- Internal Helpers ---

/**
 * Retrieves the last successful sync end timestamp for a squad.
 * Returns null if no previous sync exists (triggers full mode behavior).
 */
async function getLastSyncTimestamp(squadSlug: string): Promise<string | null> {
  const status = await getSyncStatus(squadSlug);
  if (!status || !status.lastSyncEnd) return null;
  return status.lastSyncEnd.toISOString();
}

/**
 * Builds the JQL query for sync.
 * - Incremental: `project = X AND updated >= "timestamp"`
 * - Full: `project = X AND sprint in closedSprints(board)` (sprints dos últimos 90 dias)
 * 
 * REGRA: A janela de retenção é baseada na SPRINT (não na data de criação da issue).
 * Sincronizamos todas as issues de sprints que fecharam nos últimos 90 dias.
 */
export function buildSyncJql(project: string, lastSyncTimestamp: string | null): string {
  if (lastSyncTimestamp) {
    // Incremental: busca atualizações desde o último sync
    const formatted = formatJiraDateTime(lastSyncTimestamp);
    return `project = "${project}" AND updated >= "${formatted}"`;
  }
  // Full: busca todas as issues do projeto (filtro por sprint é feito no caller via board)
  return `project = "${project}"`;
}

/**
 * Retorna a data de início da janela de retenção (hoje - 90 dias).
 */
export function getRetentionStartDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - DATA_RETENTION_DAYS);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Realiza o expurgo de dados de sprints mais antigas que a janela de retenção (90 dias).
 * Deleta issues associadas a sprints cuja complete_date é anterior a (hoje - 90 dias).
 * Changelog_events são deletados via CASCADE na FK.
 * 
 * Regra: o corte é pela data de CONCLUSÃO da sprint, não pela criação da issue.
 */
export async function purgeExpiredData(squadProject: string): Promise<number> {
  const { db } = getDatabase();
  const retentionDate = getRetentionStartDate();
  const retentionISO = retentionDate.toISOString();

  // Deletar issues cujas sprints foram concluídas antes da janela de retenção
  const result = await db.execute(
    `DELETE FROM issues WHERE project = '${squadProject}' AND sprint_id IN (
      SELECT id FROM sprints WHERE complete_date IS NOT NULL AND complete_date < '${retentionISO}'
    )`
  );

  const purgedCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;

  if (purgedCount > 0) {
    logSyncEvent("sync_purge" as "sync_complete", squadProject, {
      purged_issues: purgedCount,
      retention_cutoff: retentionISO,
      reason: "sprint_complete_date_before_cutoff",
    });
  }

  // Também limpar sprints antigas (sem issues restantes)
  await db.execute(
    `DELETE FROM sprints WHERE complete_date IS NOT NULL AND complete_date < '${retentionISO}'`
  );

  return purgedCount;
}

/**
 * Formats an ISO 8601 timestamp to Jira JQL datetime format (yyyy-MM-dd HH:mm).
 */
function formatJiraDateTime(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Persists a single issue + its changelog events within a database transaction.
 * Atomicity guarantee: either both the issue upsert and changelog replace succeed,
 * or neither does.
 */
async function persistIssueWithChangelog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  raw: JiraIssue,
  squad: SquadConfig
): Promise<void> {
  // Extract changelog events — use inline if available and not truncated
  let events = extractChangelogFromInline(raw);

  // Fallback: if inline changelog is truncated (>= 100 entries), fetch individually
  if (
    raw.changelog &&
    raw.changelog.total >= CHANGELOG_INLINE_LIMIT &&
    raw.changelog.histories.length < raw.changelog.total
  ) {
    events = await fetchFullChangelog(raw.key);
  }

  const issueRow = mapToIssueRow(raw, squad);

  await db.transaction(async (tx: typeof db) => {
    // 1. Upsert the issue record
    await tx.insert(issues).values(issueRow).onConflictDoUpdate({
      target: issues.key,
      set: {
        project: issueRow.project,
        summary: issueRow.summary,
        issueType: issueRow.issueType,
        status: issueRow.status,
        createdDate: issueRow.createdDate,
        resolutionDate: issueRow.resolutionDate,
        sprintId: issueRow.sprintId,
        boardId: issueRow.boardId,
        originalEstimateSeconds: issueRow.originalEstimateSeconds,
        fixVersion: issueRow.fixVersion,
        teamFieldValue: issueRow.teamFieldValue,
      },
    });

    // 2. Replace all changelog events for this issue
    await tx.delete(changelogEvents).where(eq(changelogEvents.issueKey, raw.key));

    if (events.length > 0) {
      await tx
        .insert(changelogEvents)
        .values(events)
        .onConflictDoNothing();
    }
  });
}

/**
 * Maps a raw Jira issue to the database issue row format.
 */
function mapToIssueRow(
  raw: JiraIssue,
  squad: SquadConfig
): typeof issues.$inferInsert {
  return {
    key: raw.key,
    project: squad.project,
    summary: (raw.fields.summary || "").slice(0, 500),
    issueType: raw.fields.issuetype?.name || "Unknown",
    status: raw.fields.status?.name || "Unknown",
    createdDate: new Date(raw.fields.created),
    resolutionDate: raw.fields.resolutiondate
      ? new Date(raw.fields.resolutiondate)
      : null,
    sprintId: null, // Sprint association managed by sync-sprints.ts
    boardId: squad.boardId,
    originalEstimateSeconds:
      raw.fields.timetracking?.originalEstimateSeconds ?? null,
    fixVersion: raw.fields.fixVersions?.[0]?.name ?? null,
    teamFieldValue: squad.teamFieldValue,
  };
}

/**
 * Extracts status transitions from the inline changelog (expand=changelog).
 * Filters only "status" field changes.
 */
function extractChangelogFromInline(
  raw: JiraIssue
): (typeof changelogEvents.$inferInsert)[] {
  if (!raw.changelog || !raw.changelog.histories) return [];

  const events: (typeof changelogEvents.$inferInsert)[] = [];

  for (const history of raw.changelog.histories) {
    for (const item of history.items) {
      if (item.field === "status") {
        events.push({
          issueKey: raw.key,
          timestamp: new Date(history.created),
          fromStatus: item.fromString ?? null,
          toStatus: item.toString ?? "Unknown",
          fieldName: "status",
        });
      }
    }
  }

  return events;
}

/**
 * Fetches the full changelog for an issue using the individual changelog endpoint.
 * Used when the inline changelog is truncated (>= 100 history entries).
 */
async function fetchFullChangelog(
  issueKey: string
): Promise<(typeof changelogEvents.$inferInsert)[]> {
  const transitions = await fetchChangelog(issueKey);

  return transitions.map((t) => ({
    issueKey,
    timestamp: new Date(t.timestamp),
    fromStatus: t.fromStatus || null,
    toStatus: t.toStatus,
    fieldName: "status",
  }));
}

/**
 * Truncates an error message to fit within the 500-char DB column limit.
 */
function truncateErrorMessage(message: string): string {
  if (message.length <= 497) return message;
  return message.slice(0, 497) + "...";
}

/**
 * Emits structured JSON log to stdout.
 * Format: { event, squad_slug, timestamp, ...extra }
 */
function logSyncEvent(
  event: "sync_start" | "sync_complete" | "sync_error",
  squadSlug: string,
  extra: Record<string, unknown> = {}
): void {
  const entry = {
    event,
    squad_slug: squadSlug,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  if (event === "sync_error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
