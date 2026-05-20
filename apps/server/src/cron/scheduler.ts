import cron from "node-cron";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { feeds } from "../db/schema.js";
import { fetchAndStoreFeed } from "../services/feedFetcher.js";
import { getDueFeedCutoff } from "./dueFeeds.js";

export function startScheduler(): void {
  // Check every 15 minutes for feeds that need refreshing
  cron.schedule("*/15 * * * *", async () => {
    console.log("[cron] Checking for feeds to refresh...");

    const activeFeeds = await db.select().from(feeds).where(eq(feeds.isActive, true));
    const now = new Date();
    const dueFeeds = activeFeeds.filter(
      (feed) =>
        feed.lastFetchedAt === null ||
        feed.lastFetchedAt < getDueFeedCutoff(feed.fetchIntervalMinutes, now),
    );

    console.log(`[cron] Found ${dueFeeds.length} feeds to refresh`);

    const results = await Promise.allSettled(dueFeeds.map((feed) => fetchAndStoreFeed(feed)));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        console.error(`[cron] Failed to refresh feed ${dueFeeds[i].url}:`, result.reason);
      }
    }
  });

  console.log("[cron] Scheduler started (every 15 minutes)");
}
