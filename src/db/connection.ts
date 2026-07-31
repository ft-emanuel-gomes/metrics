/**
 * Database connection factory.
 * Provides a singleton DatabaseClient that abstracts PostgreSQL and SQLite connections.
 * Uses drizzle-orm for both providers with auto-detected driver selection.
 */

import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import postgres from "postgres";
import Database from "better-sqlite3";
import { getDatabaseConfig } from "@/config/database";
import * as schema from "./schema";

/**
 * Unified database client interface for both PostgreSQL and SQLite providers.
 */
export interface DatabaseClient {
  /** Drizzle ORM instance for queries (typed as any to support both PG and SQLite) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  /** Close the database connection / pool */
  close(): Promise<void>;
  /** Health check — returns true if the database is reachable */
  ping(): Promise<boolean>;
}

let dbInstance: DatabaseClient | null = null;

/**
 * Returns the singleton DatabaseClient instance.
 * Creates the connection on first call based on DATABASE_PROVIDER env var.
 *
 * - PostgreSQL: uses `postgres` driver with connection pooling
 * - SQLite: uses `better-sqlite3` with WAL mode and foreign keys PRAGMA
 */
export function getDatabase(): DatabaseClient {
  if (dbInstance) return dbInstance;

  const config = getDatabaseConfig();

  if (config.provider === "postgresql") {
    const sql = postgres(config.url, { max: config.maxConnections });
    const db = drizzlePg(sql, { schema });

    dbInstance = {
      db,
      async close() {
        await sql.end();
      },
      async ping() {
        try {
          await sql`SELECT 1`;
          return true;
        } catch {
          return false;
        }
      },
    };
  } else {
    const sqlite = new Database(config.url);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzleSqlite(sqlite, { schema });

    dbInstance = {
      db,
      async close() {
        sqlite.close();
      },
      async ping() {
        // SQLite is always available if the file exists and was opened successfully
        return true;
      },
    };
  }

  return dbInstance;
}

/**
 * Resets the singleton database instance.
 * Used exclusively in tests to allow fresh connections between test runs.
 */
export function resetDatabase(): void {
  dbInstance = null;
}
