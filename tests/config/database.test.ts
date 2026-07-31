import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDatabaseConfig } from "../../src/config/database";

describe("getDatabaseConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("retorna config válida para provider postgresql", () => {
    process.env.DATABASE_PROVIDER = "postgresql";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

    const config = getDatabaseConfig();

    expect(config.provider).toBe("postgresql");
    expect(config.url).toBe("postgresql://user:pass@localhost:5432/db");
    expect(config.maxConnections).toBe(10);
    expect(config.migrationDir).toBe("./drizzle");
  });

  it("retorna config válida para provider sqlite", () => {
    process.env.DATABASE_PROVIDER = "sqlite";
    process.env.DATABASE_URL = "/app/data/metrics.db";

    const config = getDatabaseConfig();

    expect(config.provider).toBe("sqlite");
    expect(config.url).toBe("/app/data/metrics.db");
    expect(config.maxConnections).toBe(10);
    expect(config.migrationDir).toBe("./drizzle");
  });

  it("usa fallback ./data/metrics.db para sqlite quando DATABASE_URL não está definida", () => {
    process.env.DATABASE_PROVIDER = "sqlite";
    delete process.env.DATABASE_URL;

    const config = getDatabaseConfig();

    expect(config.url).toBe("./data/metrics.db");
  });

  it("usa string vazia como fallback para postgresql quando DATABASE_URL não está definida", () => {
    process.env.DATABASE_PROVIDER = "postgresql";
    delete process.env.DATABASE_URL;

    const config = getDatabaseConfig();

    expect(config.url).toBe("");
  });

  it("respeita DB_MAX_CONNECTIONS customizado", () => {
    process.env.DATABASE_PROVIDER = "postgresql";
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.DB_MAX_CONNECTIONS = "25";

    const config = getDatabaseConfig();

    expect(config.maxConnections).toBe(25);
  });

  it("usa default 10 quando DB_MAX_CONNECTIONS não está definida", () => {
    process.env.DATABASE_PROVIDER = "postgresql";
    process.env.DATABASE_URL = "postgresql://localhost/db";
    delete process.env.DB_MAX_CONNECTIONS;

    const config = getDatabaseConfig();

    expect(config.maxConnections).toBe(10);
  });

  it("lança erro quando DATABASE_PROVIDER não está definida", () => {
    delete process.env.DATABASE_PROVIDER;

    expect(() => getDatabaseConfig()).toThrow(
      'DATABASE_PROVIDER inválido: "undefined". Valores aceitos: "postgresql" ou "sqlite"'
    );
  });

  it("lança erro quando DATABASE_PROVIDER tem valor inválido", () => {
    process.env.DATABASE_PROVIDER = "mysql";

    expect(() => getDatabaseConfig()).toThrow(
      'DATABASE_PROVIDER inválido: "mysql". Valores aceitos: "postgresql" ou "sqlite"'
    );
  });

  it("lança erro quando DATABASE_PROVIDER é string vazia", () => {
    process.env.DATABASE_PROVIDER = "";

    expect(() => getDatabaseConfig()).toThrow(
      'DATABASE_PROVIDER inválido: "". Valores aceitos: "postgresql" ou "sqlite"'
    );
  });
});
