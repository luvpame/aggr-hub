import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import * as schema from "../db/schema.js";
import { migrateSqlite } from "../scripts/migrateSqlite.js";
import { createEntryRoutes } from "./entries.js";

const mocks = vi.hoisted(() => ({
  enqueueEntryEnrichment: vi.fn(),
}));

vi.mock("../services/entryEnrichment.js", () => ({
  enqueueEntryEnrichment: mocks.enqueueEntryEnrichment,
}));

let sqlite: Database.Database | undefined;
let tempDir: string | undefined;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function now(): number {
  return Math.floor(new Date("2026-06-24T00:00:00Z").getTime() / 1000);
}

function createTestDb() {
  tempDir = mkdtempSync(join(tmpdir(), "aggr-hub-entries-"));
  const sqlitePath = join(tempDir, "test.sqlite");
  migrateSqlite(sqlitePath);
  sqlite = new Database(sqlitePath);
  return drizzle(sqlite, { schema });
}

function insertEntry(): void {
  sqlite
    ?.prepare(
      `INSERT INTO feeds (
        id, url, title, site_url, feed_type, last_fetched_at, fetch_interval_minutes,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "feed-1",
      "https://example.com/feed.xml",
      "Example",
      "https://example.com",
      "rss",
      null,
      60,
      1,
      now(),
      now(),
    );

  sqlite
    ?.prepare(
      `INSERT INTO entries (
        id, feed_id, title, url, content_text, guid, summary, detailed_summary,
        summary_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "entry-1",
      "feed-1",
      "Entry",
      "https://example.com/article",
      "本文",
      "guid-entry-1",
      "古い要約",
      "古い詳細",
      "completed",
      now(),
    );
}

describe("POST /entries/:id/retry-summary", () => {
  test("resets summary fields and enqueues enrichment", async () => {
    const db = createTestDb();
    const queue = {} as Queue<{ entryId: string }>;
    insertEntry();

    const app = createEntryRoutes(db, { ENTRY_ENRICHMENT_QUEUE: queue });
    const response = await app.request("/entries/entry-1/retry-summary", { method: "POST" });

    expect(response.status).toBe(200);
    expect(mocks.enqueueEntryEnrichment).toHaveBeenCalledWith(queue, ["entry-1"]);

    const row = sqlite
      ?.prepare("SELECT summary, detailed_summary, summary_status FROM entries WHERE id = ?")
      .get("entry-1");

    expect(row).toEqual({
      summary: null,
      detailed_summary: null,
      summary_status: "pending",
    });
  });
});
