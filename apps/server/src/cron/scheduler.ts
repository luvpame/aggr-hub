import { eq } from "drizzle-orm";
import type { AppEnv, Db } from "../db/d1.js";
import { feeds } from "../db/schema.js";
import { fetchAndStoreFeed } from "../services/feedFetcher.js";
import { processDueFeeds, selectDueFeedBatch } from "./dueFeeds.js";

const SCHEDULER_INTERVAL_MS = 15 * 60_000;

export function startScheduler(db: Db, env: AppEnv = {}): void {
  setInterval(() => {
    runScheduledRefresh(db, env).catch((error) => {
      console.error("[cron] Scheduled refresh failed:", error);
    });
  }, SCHEDULER_INTERVAL_MS);
  console.log("[cron] Scheduler started (every 15 minutes)");
}

function maxFeedsPerRun(env: AppEnv): number {
  const value = Number(env.CRON_MAX_FEEDS ?? 2);
  if (!Number.isFinite(value)) return 2;
  return Math.max(1, value);
}

export async function runScheduledRefresh(
  db: Db,
  env: AppEnv = {},
  ctx?: ExecutionContext,
): Promise<void> {
  console.log("[cron] Checking for feeds to refresh...");

  const activeFeeds = await db.select().from(feeds).where(eq(feeds.isActive, true));
  const now = new Date();
  const dueFeeds = selectDueFeedBatch(activeFeeds, now, maxFeedsPerRun(env));

  console.log(`[cron] Refreshing ${dueFeeds.length} due feeds`);

  const results = await processDueFeeds(dueFeeds, (feed) => fetchAndStoreFeed(db, feed, env, ctx));
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      console.error(`[cron] Failed to refresh feed ${dueFeeds[i].url}:`, result.reason);
    }
  }
}
