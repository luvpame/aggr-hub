import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { migrateSqlite } from "../scripts/migrateSqlite.js";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("SQLite schema", () => {
  test("creates feeds and entries with expected constraints", () => {
    tempDir = mkdtempSync(join(tmpdir(), "aggr-hub-db-"));
    mkdirSync(tempDir, { recursive: true });
    const sqlitePath = join(tempDir, "test.sqlite");
    migrateSqlite(sqlitePath);

    const sqlite = new Database(sqlitePath);
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    expect(tables).toContainEqual({ name: "feeds" });
    expect(tables).toContainEqual({ name: "entries" });

    sqlite.close();
  });
});
