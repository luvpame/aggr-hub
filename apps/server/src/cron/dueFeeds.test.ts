import { describe, expect, test } from "vite-plus/test";
import { getDueFeedCutoff, processDueFeeds, selectDueFeedBatch } from "./dueFeeds.js";

describe("getDueFeedCutoff", () => {
  test("subtracts fetch interval from current time", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");
    expect(getDueFeedCutoff(60, now).toISOString()).toBe("2026-05-20T11:00:00.000Z");
  });
});

describe("processDueFeeds", () => {
  test("limits concurrent refreshes", async () => {
    const feeds = Array.from({ length: 5 }, (_, i) => ({ url: `https://example.com/${i}` }));
    let activeCount = 0;
    let maxActiveCount = 0;

    await processDueFeeds(
      feeds,
      async () => {
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeCount--;
      },
      2,
    );

    expect(maxActiveCount).toBe(2);
  });
});

describe("selectDueFeedBatch", () => {
  test("selects the oldest due feeds first", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");
    const feeds = [
      {
        url: "github-release",
        lastFetchedAt: new Date("2026-05-20T11:30:00.000Z"),
        fetchIntervalMinutes: 60,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        url: "rss-old",
        lastFetchedAt: new Date("2026-05-20T09:00:00.000Z"),
        fetchIntervalMinutes: 60,
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
      },
      {
        url: "rss-never-fetched",
        lastFetchedAt: null,
        fetchIntervalMinutes: 60,
        createdAt: new Date("2026-05-03T00:00:00.000Z"),
      },
    ];

    expect(selectDueFeedBatch(feeds, now, 2).map((feed) => feed.url)).toEqual([
      "rss-never-fetched",
      "rss-old",
    ]);
  });
});
