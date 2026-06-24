import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import * as schema from "../db/schema.js";
import { migrateSqlite } from "../scripts/migrateSqlite.js";
import { createFeedRoutes } from "./feeds.js";

const mocks = vi.hoisted(() => ({
  detectAndParseFeed: vi.fn(),
  fetchAndStoreFeed: vi.fn(),
}));

vi.mock("../services/feedDetector.js", () => ({
  detectAndParseFeed: mocks.detectAndParseFeed,
}));

vi.mock("../services/feedFetcher.js", () => ({
  fetchAndStoreFeed: mocks.fetchAndStoreFeed,
}));

let sqlite: Database.Database | undefined;
let tempDir: string | undefined;

afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
  vi.resetAllMocks();
});

function createTestDb() {
  tempDir = mkdtempSync(join(tmpdir(), "aggr-hub-feeds-"));
  const sqlitePath = join(tempDir, "test.sqlite");
  migrateSqlite(sqlitePath);
  sqlite = new Database(sqlitePath);
  return drizzle(sqlite, { schema });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("POST /feeds", () => {
  test("waits for the initial fetch before responding", async () => {
    const db = createTestDb();
    const fetchDone = deferred();

    mocks.detectAndParseFeed.mockResolvedValue({
      feedUrl: "https://example.com/feed.xml",
      title: "Example Feed",
      siteUrl: "https://example.com",
      feedType: "rss",
      description: "Example",
    });
    mocks.fetchAndStoreFeed.mockReturnValue(fetchDone.promise);

    const app = createFeedRoutes(db);
    const responsePromise = Promise.resolve(
      app.request("/feeds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/feed.xml" }),
      }),
    );

    const earlyResult = await Promise.race([
      responsePromise.then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("pending"), 10)),
    ]);

    expect(earlyResult).toBe("pending");

    fetchDone.resolve();
    const response = await responsePromise;

    expect(response.status).toBe(201);
    expect(mocks.fetchAndStoreFeed).toHaveBeenCalledTimes(1);
  });
});
