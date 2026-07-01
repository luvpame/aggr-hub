import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Db } from "../db/d1.js";
import * as schema from "../db/schema.js";
import { migrateSqlite } from "../scripts/migrateSqlite.js";
import {
  enqueueEntryEnrichment,
  processEntryEnrichmentBatch,
  type EntryEnrichmentMessage,
} from "./entryEnrichment.js";

const mocks = vi.hoisted(() => ({
  fetchOgImages: vi.fn(),
  summarizeItems: vi.fn(),
}));

vi.mock("./ogpFetcher.js", () => ({
  fetchOgImages: mocks.fetchOgImages,
}));

vi.mock("./summarizer.js", () => ({
  summarizeItems: mocks.summarizeItems,
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

function createTestDb(): Db {
  tempDir = mkdtempSync(join(tmpdir(), "aggr-hub-enrichment-"));
  const sqlitePath = join(tempDir, "test.sqlite");
  migrateSqlite(sqlitePath);
  sqlite = new Database(sqlitePath);
  return drizzle(sqlite, { schema }) as unknown as Db;
}

function insertFeedAndEntry(entryId = "entry-1", feedType = "rss"): void {
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
      feedType,
      null,
      60,
      1,
      now(),
      now(),
    );

  sqlite
    ?.prepare(
      `INSERT INTO entries (
        id, feed_id, title, url, content_text, guid, summary_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entryId,
      "feed-1",
      "Entry",
      "https://example.com/article",
      "これは十分に長い本文です。".repeat(10),
      `guid-${entryId}`,
      "pending",
      now(),
    );
}

function message(entryId: string): Message<EntryEnrichmentMessage> {
  return {
    id: `message-${entryId}`,
    timestamp: new Date("2026-06-24T00:00:00Z"),
    body: { entryId },
    attempts: 1,
    retry: vi.fn(),
    ack: vi.fn(),
  };
}

describe("enqueueEntryEnrichment", () => {
  test("sends unique entry ids to the queue", async () => {
    const sendBatch = vi.fn(async () => ({
      metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    }));
    const queue = {
      sendBatch,
    } as unknown as Queue<EntryEnrichmentMessage>;

    await enqueueEntryEnrichment(queue, ["entry-1", "entry-1", "entry-2"]);

    expect(sendBatch).toHaveBeenCalledWith([
      { body: { entryId: "entry-1" } },
      { body: { entryId: "entry-2" } },
    ]);
  });
});

describe("processEntryEnrichmentBatch", () => {
  test("updates OGP image and summary for an entry", async () => {
    const db = createTestDb();
    insertFeedAndEntry();

    mocks.fetchOgImages.mockResolvedValue(["https://example.com/og.png"]);
    mocks.summarizeItems.mockResolvedValue(
      new Map([["entry-1", { summary: "要約", detailedSummary: "詳細な要約" }]]),
    );

    await processEntryEnrichmentBatch(db, [message("entry-1")], {
      OGP_MAX_ITEMS_PER_FEED: "10",
      SUMMARY_MAX_ITEMS_PER_FEED: "10",
    });

    const row = sqlite
      ?.prepare(
        "SELECT og_image_url, summary, detailed_summary, summary_status FROM entries WHERE id = ?",
      )
      .get("entry-1");

    expect(row).toEqual({
      og_image_url: "https://example.com/og.png",
      summary: "要約",
      detailed_summary: "詳細な要約",
      summary_status: "completed",
    });
  });

  test("ignores missing entries", async () => {
    const db = createTestDb();

    await processEntryEnrichmentBatch(db, [message("missing")], {});

    expect(mocks.fetchOgImages).not.toHaveBeenCalled();
    expect(mocks.summarizeItems).not.toHaveBeenCalled();
  });

  test("marks summary as failed when summarization returns no result", async () => {
    const db = createTestDb();
    insertFeedAndEntry();

    mocks.fetchOgImages.mockResolvedValue([undefined]);
    mocks.summarizeItems.mockResolvedValue(new Map());

    await processEntryEnrichmentBatch(db, [message("entry-1")], {
      OGP_MAX_ITEMS_PER_FEED: "10",
      SUMMARY_MAX_ITEMS_PER_FEED: "10",
    });

    const row = sqlite?.prepare("SELECT summary_status FROM entries WHERE id = ?").get("entry-1");

    expect(row).toEqual({ summary_status: "failed" });
  });
});
