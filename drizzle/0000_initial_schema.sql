-- Enums
CREATE TYPE "board_type" AS ENUM ('scrum', 'kanban');
CREATE TYPE "sprint_state" AS ENUM ('active', 'closed', 'future');
CREATE TYPE "sync_status_type" AS ENUM ('success', 'error', 'partial', 'pending');

-- Tables
CREATE TABLE IF NOT EXISTS "boards" (
  "id" integer PRIMARY KEY NOT NULL,
  "project_key" varchar(10) NOT NULL,
  "name" varchar(100) NOT NULL,
  "board_type" "board_type" NOT NULL
);

CREATE TABLE IF NOT EXISTS "sprints" (
  "id" integer PRIMARY KEY NOT NULL,
  "board_id" integer NOT NULL REFERENCES "boards"("id"),
  "name" varchar(100) NOT NULL,
  "state" "sprint_state" NOT NULL,
  "start_date" timestamp with time zone NOT NULL,
  "end_date" timestamp with time zone NOT NULL,
  "complete_date" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "issues" (
  "key" varchar(20) PRIMARY KEY NOT NULL,
  "project" varchar(10) NOT NULL,
  "summary" varchar(500) NOT NULL,
  "issue_type" varchar(50) NOT NULL,
  "status" varchar(50) NOT NULL,
  "created_date" timestamp with time zone NOT NULL,
  "resolution_date" timestamp with time zone,
  "sprint_id" integer REFERENCES "sprints"("id"),
  "board_id" integer NOT NULL REFERENCES "boards"("id"),
  "original_estimate_seconds" integer,
  "fix_version" varchar(100),
  "team_field_value" varchar(100)
);

CREATE TABLE IF NOT EXISTS "changelog_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "issue_key" varchar(20) NOT NULL REFERENCES "issues"("key") ON DELETE CASCADE,
  "timestamp" timestamp with time zone NOT NULL,
  "from_status" varchar(50),
  "to_status" varchar(50) NOT NULL,
  "field_name" varchar(50) NOT NULL DEFAULT 'status'
);

CREATE TABLE IF NOT EXISTS "sync_status" (
  "squad_slug" varchar(50) PRIMARY KEY NOT NULL,
  "last_sync_start" timestamp with time zone,
  "last_sync_end" timestamp with time zone,
  "last_sync_status" "sync_status_type" NOT NULL DEFAULT 'pending',
  "issues_synced_count" integer NOT NULL DEFAULT 0,
  "error_message" varchar(500)
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_sprints_board_state" ON "sprints" ("board_id", "state");
CREATE INDEX IF NOT EXISTS "idx_issues_project_status" ON "issues" ("project", "status");
CREATE INDEX IF NOT EXISTS "idx_issues_sprint" ON "issues" ("sprint_id");
CREATE INDEX IF NOT EXISTS "idx_issues_board" ON "issues" ("board_id");
CREATE INDEX IF NOT EXISTS "idx_issues_fix_version_team" ON "issues" ("fix_version", "team_field_value");
CREATE INDEX IF NOT EXISTS "idx_changelog_issue_key" ON "changelog_events" ("issue_key");
CREATE INDEX IF NOT EXISTS "idx_changelog_to_status_ts" ON "changelog_events" ("to_status", "timestamp");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_changelog_event" ON "changelog_events" ("issue_key", "timestamp", "to_status");
