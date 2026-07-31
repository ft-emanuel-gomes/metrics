/**
 * Unit tests for sync worker logic.
 * Tests: JQL construction, full resync detection, skip behavior, error handling.
 * Requirements: 2.1, 2.2, 2.10, 2.11
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSyncJql } from "../../src/sync/sync-issues";

// Mock the DB queries module used by sync-status
vi.mock("@/db/queries/sync-status", () => ({
  selectSyncStatus: vi.fn(),
  upsertSyncStatus: vi.fn(),
}));

// We need to import after mocking
import { isSyncInProgress } from "../../src/sync/sync-status";
import { selectSyncStatus } from "@/db/queries/sync-status";

const mockedSelectSyncStatus = vi.mocked(selectSyncStatus);

describe("buildSyncJql", () => {
  it("returns full resync JQL when lastSyncTimestamp is null", () => {
    const result = buildSyncJql("CT", null);
    expect(result).toBe("project = CT");
  });

  it("returns incremental JQL with formatted date when lastSyncTimestamp is provided", () => {
    // 2024-06-15T14:30:00.000Z → formatted as local time
    const iso = "2024-06-15T14:30:00.000Z";
    const result = buildSyncJql("CS", iso);

    // The date should be formatted in local time as yyyy-MM-dd HH:mm
    const date = new Date(iso);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const expected = `project = CS AND updated >= "${year}-${month}-${day} ${hours}:${minutes}"`;

    expect(result).toBe(expected);
  });

  it("formats Jira datetime correctly (yyyy-MM-dd HH:mm)", () => {
    // Test with a known timestamp — we verify the format structure
    const iso = "2025-01-05T09:07:00.000Z";
    const result = buildSyncJql("LC", iso);

    // Should contain the date pattern in the JQL
    expect(result).toMatch(
      /^project = LC AND updated >= "\d{4}-\d{2}-\d{2} \d{2}:\d{2}"$/
    );
  });

  it("handles midnight correctly", () => {
    const midnight = "2024-12-31T00:00:00.000Z";
    const result = buildSyncJql("INT", midnight);

    const date = new Date(midnight);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    expect(result).toContain(`${hours}:${minutes}`);
    expect(result).toContain("project = INT AND updated >=");
  });
});

describe("isSyncInProgress", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, SYNC_INTERVAL_MINUTES: "15" };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns false when no sync status record exists", async () => {
    mockedSelectSyncStatus.mockResolvedValue(null);

    const result = await isSyncInProgress("custodia");
    expect(result).toBe(false);
  });

  it("returns true when status is 'pending' and lastSyncStart is recent", async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
    mockedSelectSyncStatus.mockResolvedValue({
      squadSlug: "custodia",
      lastSyncStatus: "pending",
      lastSyncStart: twoMinutesAgo,
      lastSyncEnd: null,
      issuesSyncedCount: 0,
      errorMessage: null,
    });

    const result = await isSyncInProgress("custodia");
    expect(result).toBe(true);
  });

  it("returns false when status is 'success' (not pending)", async () => {
    mockedSelectSyncStatus.mockResolvedValue({
      squadSlug: "custodia",
      lastSyncStatus: "success",
      lastSyncStart: new Date(Date.now() - 2 * 60_000),
      lastSyncEnd: new Date(Date.now() - 1 * 60_000),
      issuesSyncedCount: 42,
      errorMessage: null,
    });

    const result = await isSyncInProgress("custodia");
    expect(result).toBe(false);
  });

  it("returns false when status is 'pending' but lastSyncStart exceeds interval (ghost lock)", async () => {
    // SYNC_INTERVAL_MINUTES = 15 → 15 * 60_000 = 900_000 ms
    // If lastSyncStart is 20 minutes ago, it exceeds the interval → ghost lock detected
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60_000);
    mockedSelectSyncStatus.mockResolvedValue({
      squadSlug: "custodia",
      lastSyncStatus: "pending",
      lastSyncStart: twentyMinutesAgo,
      lastSyncEnd: null,
      issuesSyncedCount: 0,
      errorMessage: null,
    });

    const result = await isSyncInProgress("custodia");
    expect(result).toBe(false);
  });
});
