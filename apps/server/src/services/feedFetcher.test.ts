import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { Db } from "../db/d1.js";
import { fetchAndStoreFeed } from "./feedFetcher.js";

const mocks = vi.hoisted(() => ({
  enqueueEntryEnrichment: vi.fn(),
  parseRssFeed: vi.fn(),
}));

vi.mock("./entryEnrichment.js", () => ({
  enqueueEntryEnrichment: mocks.enqueueEntryEnrichment,
  getEntryEnrichmentLimit: (env: {
    OGP_MAX_ITEMS_PER_FEED?: string;
    SUMMARY_MAX_ITEMS_PER_FEED?: string;
  }) =>
    Math.max(
      Number(env.OGP_MAX_ITEMS_PER_FEED ?? 10),
      Number(env.SUMMARY_MAX_ITEMS_PER_FEED ?? 10),
    ),
}));

vi.mock("./rssParser.js", () => ({
  parseRssFeed: mocks.parseRssFeed,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("fetchAndStoreFeed", () => {
  test("splits entry inserts into D1-safe batches", async () => {
    const insertBatches: unknown[][] = [];
    const db = {
      insert: () => ({
        values: (rows: unknown[]) => {
          insertBatches.push(rows);
          return {
            onConflictDoNothing: () => ({
              returning: async () =>
                rows.map((row, index) => ({
                  id: `entry-${insertBatches.length}-${index}`,
                  url: (row as { url: string }).url,
                  contentText: null,
                  ogImageUrl: null,
                })),
            }),
          };
        },
      }),
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
    } as unknown as Db;

    mocks.parseRssFeed.mockResolvedValue({
      feed: {
        items: Array.from({ length: 20 }, (_, index) => ({
          title: `Entry ${index}`,
          url: `https://example.com/${index}`,
          contentHtml: "html",
          contentText: "text",
          author: "author",
          publishedAt: new Date("2026-06-24T00:00:00Z"),
          guid: `guid-${index}`,
          imageUrl: undefined,
        })),
      },
    });

    await fetchAndStoreFeed(
      db,
      {
        id: "feed-1",
        url: "https://example.com/feed.xml",
        title: null,
        siteUrl: null,
        feedType: "rss",
        description: null,
        iconUrl: null,
        lastFetchedAt: null,
        lastEtag: null,
        lastModified: null,
        fetchIntervalMinutes: 60,
        isActive: true,
        createdAt: new Date("2026-06-24T00:00:00Z"),
        updatedAt: new Date("2026-06-24T00:00:00Z"),
      },
      {
        OGP_MAX_ITEMS_PER_FEED: "0",
        SUMMARY_MAX_ITEMS_PER_FEED: "0",
      },
    );

    expect(insertBatches.map((rows) => rows.length)).toEqual([5, 5, 5, 5]);
  });

  test("enqueues inserted entries for async enrichment", async () => {
    const queue = {};
    const db = {
      insert: () => ({
        values: (rows: unknown[]) => ({
          onConflictDoNothing: () => ({
            returning: async () =>
              rows.map((_row, index) => ({
                id: `entry-${index}`,
              })),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
    } as unknown as Db;

    mocks.parseRssFeed.mockResolvedValue({
      feed: {
        items: Array.from({ length: 4 }, (_, index) => ({
          title: `Entry ${index}`,
          url: `https://example.com/${index}`,
          contentHtml: "html",
          contentText: "text",
          author: "author",
          publishedAt: new Date("2026-06-24T00:00:00Z"),
          guid: `guid-${index}`,
          imageUrl: undefined,
        })),
      },
    });

    await fetchAndStoreFeed(
      db,
      {
        id: "feed-1",
        url: "https://example.com/feed.xml",
        title: null,
        siteUrl: null,
        feedType: "rss",
        description: null,
        iconUrl: null,
        lastFetchedAt: null,
        lastEtag: null,
        lastModified: null,
        fetchIntervalMinutes: 60,
        isActive: true,
        createdAt: new Date("2026-06-24T00:00:00Z"),
        updatedAt: new Date("2026-06-24T00:00:00Z"),
      },
      {
        ENTRY_ENRICHMENT_QUEUE: queue as Queue<{ entryId: string }>,
        OGP_MAX_ITEMS_PER_FEED: "2",
        SUMMARY_MAX_ITEMS_PER_FEED: "3",
      },
    );

    expect(mocks.enqueueEntryEnrichment).toHaveBeenCalledWith(queue, [
      "entry-0",
      "entry-1",
      "entry-2",
    ]);
  });
});
