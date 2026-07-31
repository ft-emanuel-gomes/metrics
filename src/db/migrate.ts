/**
 * Migration runner for the persistent data store.
 * Supports both PostgreSQL and SQLite migrators from Drizzle ORM.
 * Idempotent: already-applied migrations are automatically skipped.
 */

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { getDatabase } from "./connection";
import { getDatabaseConfig } from "@/config/database";

/**
 * Executa todas as migrações pendentes no banco de dados.
 * - PostgreSQL: usa drizzle-orm/postgres-js/migrator (async)
 * - SQLite: usa drizzle-orm/better-sqlite3/migrator (sync)
 *
 * Migrações já aplicadas são automaticamente ignoradas pelo Drizzle.
 * Loga duração e provider ao final da execução.
 */
export async function runMigrations(): Promise<void> {
  const config = getDatabaseConfig();
  const { db } = getDatabase();

  console.log(`[Migrate] Running migrations (provider: ${config.provider})...`);
  const start = Date.now();

  if (config.provider === "postgresql") {
    await migrate(db, { migrationsFolder: config.migrationDir });
  } else {
    migrateSqlite(db, { migrationsFolder: config.migrationDir });
  }

  console.log(`[Migrate] Done in ${Date.now() - start}ms`);
}
