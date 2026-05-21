import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { feeds } from "../db/schema.js";
import { fetchAndStoreFeed } from "../services/feedFetcher.js";
import { getDueFeedCutoff, processDueFeeds } from "./dueFeeds.js";

const SCHEDULER_INTERVAL_MS = 15 * 60_000;

export function startScheduler(): void {
  setInterval(checkFeedsToRefresh, SCHEDULER_INTERVAL_MS);
  console.log("[cron] Scheduler started (every 15 minutes)");
}

async function checkFeedsToRefresh(): Promise<void> {
  console.log("[cron] Checking for feeds to refresh...");

  const activeFeeds = await db.select().from(feeds).where(eq(feeds.isActive, true));
  const now = new Date();
  const dueFeeds = activeFeeds.filter(
    (feed) =>
      feed.lastFetchedAt === null ||
      feed.lastFetchedAt < getDueFeedCutoff(feed.fetchIntervalMinutes, now),
  );

  console.log(`[cron] Found ${dueFeeds.length} feeds to refresh`);

  const results = await processDueFeeds(dueFeeds, fetchAndStoreFeed);
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      console.error(`[cron] Failed to refresh feed ${dueFeeds[i].url}:`, result.reason);
    }
  }
}
