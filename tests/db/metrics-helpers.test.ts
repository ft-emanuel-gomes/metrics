import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isDataStale, clampCacheTtl, getMetricsCacheTtl } from "../../src/db/metrics/index";

describe("isDataStale", () => {
  it("returns true when lastSyncEnd is null", () => {
    expect(isDataStale(null)).toBe(true);
  });

  it("returns true when last sync was more than 24 hours ago", () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
    expect(isDataStale(thirtyHoursAgo)).toBe(true);
  });

  it("returns false when last sync was less than 24 hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(isDataStale(twoHoursAgo)).toBe(false);
  });

  it("returns true when last sync was exactly 24h + 1ms ago", () => {
    const justOver24h = new Date(Date.now() - (24 * 60 * 60 * 1000 + 1));
    expect(isDataStale(justOver24h)).toBe(true);
  });

  it("returns false when last sync was exactly now", () => {
    expect(isDataStale(new Date())).toBe(false);
  });
});

describe("clampCacheTtl", () => {
  it("returns 60 when ttl is below minimum", () => {
    expect(clampCacheTtl(10)).toBe(60);
    expect(clampCacheTtl(0)).toBe(60);
    expect(clampCacheTtl(-100)).toBe(60);
  });

  it("returns 3600 when ttl is above maximum", () => {
    expect(clampCacheTtl(5000)).toBe(3600);
    expect(clampCacheTtl(999999)).toBe(3600);
  });

  it("returns the value unchanged when within valid range", () => {
    expect(clampCacheTtl(60)).toBe(60);
    expect(clampCacheTtl(300)).toBe(300);
    expect(clampCacheTtl(3600)).toBe(3600);
    expect(clampCacheTtl(1800)).toBe(1800);
  });
});

describe("getMetricsCacheTtl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns 300 (default) when CACHE_TTL_METRICS is not set", () => {
    delete process.env.CACHE_TTL_METRICS;
    expect(getMetricsCacheTtl()).toBe(300);
  });

  it("returns clamped value from env", () => {
    process.env.CACHE_TTL_METRICS = "600";
    expect(getMetricsCacheTtl()).toBe(600);
  });

  it("clamps to 60 when env value is too low", () => {
    process.env.CACHE_TTL_METRICS = "5";
    expect(getMetricsCacheTtl()).toBe(60);
  });

  it("clamps to 3600 when env value is too high", () => {
    process.env.CACHE_TTL_METRICS = "10000";
    expect(getMetricsCacheTtl()).toBe(3600);
  });

  it("returns 300 (default) for non-numeric env value", () => {
    process.env.CACHE_TTL_METRICS = "abc";
    expect(getMetricsCacheTtl()).toBe(300);
  });
});
