import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDashboardAdapter } from "../../src/adapters/adapter-factory";
import { fetchSprintDashboard } from "../../src/adapters/sprint-adapter";
import { fetchKanbanDashboard } from "../../src/adapters/kanban-adapter";
import { fetchSprintDashboardFromDb } from "../../src/adapters/sprint-adapter-db";
import { fetchKanbanDashboardFromDb } from "../../src/adapters/kanban-adapter-db";
import { SQUADS_CONFIG } from "../../src/config/squads";

/**
 * Unit tests for adapter-factory.ts
 * Validates: Requirements 11.5, 6.1
 *
 * Requirement 11.5: WHILE USE_DATABASE_METRICS is "false" or unset → Jira-direct;
 *                   WHILE USE_DATABASE_METRICS is "true" → Data_Store exclusively.
 * Requirement 6.1:  Dashboard serves all metric responses from Data_Store when DB mode active.
 */
describe("createDashboardAdapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('when USE_DATABASE_METRICS="true"', () => {
    beforeEach(() => {
      process.env.USE_DATABASE_METRICS = "true";
    });

    it("returns fetchSprintDashboardFromDb for sprint squad (custodia)", () => {
      const squad = SQUADS_CONFIG["custodia"];
      const adapter = createDashboardAdapter(squad);

      expect(adapter).toBe(fetchSprintDashboardFromDb);
    });

    it("returns fetchKanbanDashboardFromDb for kanban squad (riscos)", () => {
      const squad = SQUADS_CONFIG["riscos"];
      const adapter = createDashboardAdapter(squad);

      expect(adapter).toBe(fetchKanbanDashboardFromDb);
    });
  });

  describe('when USE_DATABASE_METRICS="false"', () => {
    beforeEach(() => {
      process.env.USE_DATABASE_METRICS = "false";
    });

    it("returns fetchSprintDashboard for sprint squad (custodia)", () => {
      const squad = SQUADS_CONFIG["custodia"];
      const adapter = createDashboardAdapter(squad);

      expect(adapter).toBe(fetchSprintDashboard);
    });

    it("returns fetchKanbanDashboard for kanban squad (riscos)", () => {
      const squad = SQUADS_CONFIG["riscos"];
      const adapter = createDashboardAdapter(squad);

      expect(adapter).toBe(fetchKanbanDashboard);
    });
  });

  describe("when USE_DATABASE_METRICS is unset (default)", () => {
    beforeEach(() => {
      delete process.env.USE_DATABASE_METRICS;
    });

    it("returns Jira-direct adapter for sprint squad (custodia)", () => {
      const squad = SQUADS_CONFIG["custodia"];
      const adapter = createDashboardAdapter(squad);

      expect(adapter).toBe(fetchSprintDashboard);
    });

    it("returns Jira-direct adapter for kanban squad (riscos)", () => {
      const squad = SQUADS_CONFIG["riscos"];
      const adapter = createDashboardAdapter(squad);

      expect(adapter).toBe(fetchKanbanDashboard);
    });
  });
});
