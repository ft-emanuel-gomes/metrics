/**
 * Database configuration module.
 * Supports PostgreSQL and SQLite as persistence providers.
 */

export interface DatabaseConfig {
  provider: "postgresql" | "sqlite";
  /** PostgreSQL connection string or SQLite file path */
  url: string;
  /** Connection pool size (PostgreSQL only, default: 10) */
  maxConnections: number;
  /** Path to drizzle migrations folder */
  migrationDir: string;
}

/**
 * Lê e valida a configuração do banco de dados a partir das variáveis de ambiente.
 * Lança erro se DATABASE_PROVIDER for inválido.
 */
export function getDatabaseConfig(): DatabaseConfig {
  const provider = process.env.DATABASE_PROVIDER as "postgresql" | "sqlite";

  if (!provider || !["postgresql", "sqlite"].includes(provider)) {
    throw new Error(
      `DATABASE_PROVIDER inválido: "${provider}". Valores aceitos: "postgresql" ou "sqlite"`
    );
  }

  return {
    provider,
    url: process.env.DATABASE_URL || (provider === "sqlite" ? "./data/metrics.db" : ""),
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "10", 10),
    migrationDir: "./drizzle",
  };
}
