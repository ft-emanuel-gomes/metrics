import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock external dependencies to avoid native module issues
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn(() => ({ query: {} })),
}));

vi.mock("drizzle-orm/better-sqlite3", () => ({
  drizzle: vi.fn(() => ({ query: {} })),
}));

vi.mock("postgres", () => ({
  default: vi.fn(() => {
    const sql = Object.assign(
      vi.fn(async () => [{ "?column?": 1 }]),
      { end: vi.fn(async () => {}) }
    );
    return sql;
  }),
}));

vi.mock("better-sqlite3", () => ({
  default: vi.fn(() => ({
    pragma: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("@/db/schema", () => ({}));

describe("Database Connection Factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Reset module cache to get fresh singleton between tests
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getDatabase() singleton behavior", () => {
    it("returns the same instance when called multiple times", async () => {
      process.env.DATABASE_PROVIDER = "postgresql";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

      const { getDatabase } = await import("../../src/db/connection");

      const instance1 = getDatabase();
      const instance2 = getDatabase();

      expect(instance1).toBe(instance2);
    });

    it("returns a DatabaseClient with db, close, and ping properties", async () => {
      process.env.DATABASE_PROVIDER = "postgresql";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

      const { getDatabase } = await import("../../src/db/connection");

      const client = getDatabase();

      expect(client).toHaveProperty("db");
      expect(client).toHaveProperty("close");
      expect(client).toHaveProperty("ping");
      expect(typeof client.close).toBe("function");
      expect(typeof client.ping).toBe("function");
    });

    it("creates PostgreSQL connection when provider is postgresql", async () => {
      process.env.DATABASE_PROVIDER = "postgresql";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

      const { getDatabase } = await import("../../src/db/connection");
      const client = getDatabase();

      expect(client.db).toBeDefined();
      // Ping should call SELECT 1 on postgres
      const pingResult = await client.ping();
      expect(pingResult).toBe(true);
    });

    it("creates SQLite connection when provider is sqlite", async () => {
      process.env.DATABASE_PROVIDER = "sqlite";
      process.env.DATABASE_URL = "./data/test.db";

      const { getDatabase } = await import("../../src/db/connection");
      const client = getDatabase();

      expect(client.db).toBeDefined();
      // SQLite ping always returns true
      const pingResult = await client.ping();
      expect(pingResult).toBe(true);
    });
  });

  describe("resetDatabase()", () => {
    it("allows creating a new instance after reset", async () => {
      process.env.DATABASE_PROVIDER = "postgresql";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

      const { getDatabase, resetDatabase } = await import("../../src/db/connection");

      const instance1 = getDatabase();
      resetDatabase();
      const instance2 = getDatabase();

      // After reset, a new instance should be created (different reference)
      expect(instance1).not.toBe(instance2);
    });

    it("does not throw when called before any getDatabase call", async () => {
      process.env.DATABASE_PROVIDER = "postgresql";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

      const { resetDatabase } = await import("../../src/db/connection");

      expect(() => resetDatabase()).not.toThrow();
    });
  });

  describe("SQLite PRAGMA settings", () => {
    it("sets WAL journal mode and foreign keys ON for SQLite", async () => {
      process.env.DATABASE_PROVIDER = "sqlite";
      process.env.DATABASE_URL = "./data/test.db";

      const Database = (await import("better-sqlite3")).default;

      const { getDatabase } = await import("../../src/db/connection");
      getDatabase();

      // Verify the Database constructor was called
      expect(Database).toHaveBeenCalledWith("./data/test.db");

      // Verify pragma calls
      const mockInstance = (Database as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
      expect(mockInstance.pragma).toHaveBeenCalledWith("journal_mode = WAL");
      expect(mockInstance.pragma).toHaveBeenCalledWith("foreign_keys = ON");
    });
  });

  describe("DatabaseClient interface compliance", () => {
    it("close() resolves without error for postgresql", async () => {
      process.env.DATABASE_PROVIDER = "postgresql";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

      const { getDatabase } = await import("../../src/db/connection");
      const client = getDatabase();

      await expect(client.close()).resolves.toBeUndefined();
    });

    it("close() resolves without error for sqlite", async () => {
      process.env.DATABASE_PROVIDER = "sqlite";
      process.env.DATABASE_URL = "./data/test.db";

      const { getDatabase } = await import("../../src/db/connection");
      const client = getDatabase();

      await expect(client.close()).resolves.toBeUndefined();
    });

    it("ping() returns false when PostgreSQL query fails", async () => {
      process.env.DATABASE_PROVIDER = "postgresql";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";

      // Re-mock postgres to throw on query
      vi.doMock("postgres", () => ({
        default: vi.fn(() => {
          const sql = Object.assign(
            vi.fn(async () => { throw new Error("Connection refused"); }),
            { end: vi.fn(async () => {}) }
          );
          return sql;
        }),
      }));

      const { getDatabase } = await import("../../src/db/connection");
      const client = getDatabase();

      const pingResult = await client.ping();
      expect(pingResult).toBe(false);
    });
  });
});
