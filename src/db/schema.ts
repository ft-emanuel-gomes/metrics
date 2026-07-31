import {
  pgTable, serial, varchar, integer, timestamp,
  boolean, text, uniqueIndex, index, pgEnum
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// --- Enums ---
export const boardTypeEnum = pgEnum("board_type", ["scrum", "kanban"]);
export const sprintStateEnum = pgEnum("sprint_state", ["active", "closed", "future"]);
export const syncStatusEnum = pgEnum("sync_status_type", [
  "success", "error", "partial", "pending"
]);

// --- Tables ---

export const boards = pgTable("boards", {
  id: integer("id").primaryKey(),
  projectKey: varchar("project_key", { length: 10 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  boardType: boardTypeEnum("board_type").notNull(),
});

export const sprints = pgTable("sprints", {
  id: integer("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => boards.id),
  name: varchar("name", { length: 100 }).notNull(),
  state: sprintStateEnum("state").notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  completeDate: timestamp("complete_date", { withTimezone: true }),
}, (table) => [
  index("idx_sprints_board_state").on(table.boardId, table.state),
]);

export const issues = pgTable("issues", {
  key: varchar("key", { length: 20 }).primaryKey(),
  project: varchar("project", { length: 10 }).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  issueType: varchar("issue_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  createdDate: timestamp("created_date", { withTimezone: true }).notNull(),
  resolutionDate: timestamp("resolution_date", { withTimezone: true }),
  sprintId: integer("sprint_id").references(() => sprints.id),
  boardId: integer("board_id").notNull().references(() => boards.id),
  originalEstimateSeconds: integer("original_estimate_seconds"),
  fixVersion: varchar("fix_version", { length: 100 }),
  teamFieldValue: varchar("team_field_value", { length: 100 }),
}, (table) => [
  index("idx_issues_project_status").on(table.project, table.status),
  index("idx_issues_sprint").on(table.sprintId),
  index("idx_issues_board").on(table.boardId),
  index("idx_issues_fix_version_team").on(table.fixVersion, table.teamFieldValue),
]);

export const changelogEvents = pgTable("changelog_events", {
  id: serial("id").primaryKey(),
  issueKey: varchar("issue_key", { length: 20 }).notNull()
    .references(() => issues.key, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  fieldName: varchar("field_name", { length: 50 }).notNull().default("status"),
}, (table) => [
  index("idx_changelog_issue_key").on(table.issueKey),
  index("idx_changelog_to_status_ts").on(table.toStatus, table.timestamp),
  uniqueIndex("uq_changelog_event").on(
    table.issueKey, table.timestamp, table.toStatus
  ),
]);

export const syncStatus = pgTable("sync_status", {
  squadSlug: varchar("squad_slug", { length: 50 }).primaryKey(),
  lastSyncStart: timestamp("last_sync_start", { withTimezone: true }),
  lastSyncEnd: timestamp("last_sync_end", { withTimezone: true }),
  lastSyncStatus: syncStatusEnum("last_sync_status").notNull().default("pending"),
  issuesSyncedCount: integer("issues_synced_count").notNull().default(0),
  errorMessage: varchar("error_message", { length: 500 }),
});

// --- Relations ---

export const boardsRelations = relations(boards, ({ many }) => ({
  sprints: many(sprints),
  issues: many(issues),
}));

export const sprintsRelations = relations(sprints, ({ one, many }) => ({
  board: one(boards, { fields: [sprints.boardId], references: [boards.id] }),
  issues: many(issues),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  sprint: one(sprints, { fields: [issues.sprintId], references: [sprints.id] }),
  board: one(boards, { fields: [issues.boardId], references: [boards.id] }),
  changelogEvents: many(changelogEvents),
}));

export const changelogEventsRelations = relations(changelogEvents, ({ one }) => ({
  issue: one(issues, { fields: [changelogEvents.issueKey], references: [issues.key] }),
}));
