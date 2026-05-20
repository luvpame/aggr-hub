import { describe, expect, test } from "vite-plus/test";
import { normalizePostgresBoolean, normalizePostgresDate } from "./migratePostgresToSqlite.js";

describe("PostgreSQL to SQLite migration mapping", () => {
  test("normalizes booleans from PostgreSQL-compatible values", () => {
    expect(normalizePostgresBoolean(true)).toBe(true);
    expect(normalizePostgresBoolean(false)).toBe(false);
    expect(normalizePostgresBoolean(1)).toBe(true);
    expect(normalizePostgresBoolean(0)).toBe(false);
  });

  test("normalizes dates from Date, string, and null values", () => {
    expect(normalizePostgresDate(new Date("2026-05-20T12:00:00.000Z"))).toEqual(
      new Date("2026-05-20T12:00:00.000Z"),
    );
    expect(normalizePostgresDate("2026-05-20T12:00:00.000Z")).toEqual(
      new Date("2026-05-20T12:00:00.000Z"),
    );
    expect(normalizePostgresDate(null)).toBeNull();
  });
});
