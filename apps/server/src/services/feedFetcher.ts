import { eq } from "drizzle-orm";
import type { AppEnv, Db } from "../db/d1.js";
import { feeds, entries, type feeds as FeedsTable } from "../db/schema.js";
import { parseRssFeed } from "./rssParser.js";
import { fetchOgImages } from "./ogpFetcher.js";
import { summarizeItems } from "./summarizer.js";
import { runBackgroundTask } from "../utils/backgroundTask.js";

type Feed = typeof FeedsTable.$inferSelect;
const ENTRY_INSERT_BATCH_SIZE = 5;

export async function fetchAndStoreFeed(
  db: Db,
  feed: Feed,
  env: AppEnv = {},
  ctx?: ExecutionContext,
): Promise<void> {
  try {
    await fetchRssFeed(db, feed, env, ctx);
  } catch (error) {
    console.error(`Failed to fetch feed ${feed.url}:`, error);
  }
}

async function updateFeedTimestamp(
  db: Db,
  feedId: string,
  cacheHeaders?: { etag?: string; lastModified?: string },
): Promise<void> {
  await db
    .update(feeds)
    .set({
      lastFetchedAt: new Date(),
      updatedAt: new Date(),
      ...cacheHeaders,
    })
    .where(eq(feeds.id, feedId));
}

function deriveSummaryStatus(
  result: { skipped?: boolean; detailedSummary?: string | null },
  feedType: string,
): "skipped" | "completed" | "failed" {
  if (result.skipped) return "skipped";
  if (feedType === "github-releases" && !result.detailedSummary) return "failed";
  return "completed";
}

function envLimit(value: string | undefined, fallback: number): number {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(0, limit);
}

async function fetchRssFeed(
  db: Db,
  feed: Feed,
  env: AppEnv,
  ctx?: ExecutionContext,
): Promise<void> {
  const result = await parseRssFeed(feed.url, {
    etag: feed.lastEtag,
    lastModified: feed.lastModified,
  });

  if (result === null) {
    console.log(`[feedFetcher] feed ${feed.id} not modified (304)`);
    await updateFeedTimestamp(db, feed.id);
    return;
  }

  const { feed: parsed, etag, lastModified } = result;
  const cacheHeaders = {
    lastEtag: etag ?? feed.lastEtag ?? undefined,
    lastModified: lastModified ?? feed.lastModified ?? undefined,
  };

  const itemsWithGuid = parsed.items.filter((item) => item.guid);

  const skipOgp = feed.feedType === "github-releases";

  const rows = itemsWithGuid.map((item) => ({
    feedId: feed.id,
    title: item.title,
    url: item.url,
    contentHtml: item.contentHtml,
    contentText: item.contentText,
    author: item.author,
    publishedAt: item.publishedAt,
    guid: item.guid,
    ogImageUrl: item.imageUrl,
  }));

  if (rows.length === 0) {
    await updateFeedTimestamp(db, feed.id, cacheHeaders);
    return;
  }

  const inserted = [];
  for (let i = 0; i < rows.length; i += ENTRY_INSERT_BATCH_SIZE) {
    // ponytail: small fixed D1 batch; raise it only after measuring D1 variable limits.
    const batch = rows.slice(i, i + ENTRY_INSERT_BATCH_SIZE);
    inserted.push(
      ...(await db.insert(entries).values(batch).onConflictDoNothing().returning({
        id: entries.id,
        url: entries.url,
        contentText: entries.contentText,
        ogImageUrl: entries.ogImageUrl,
      })),
    );
  }

  console.log(`[feedFetcher] inserted ${inserted.length} new entries for feed ${feed.id}`);

  await updateFeedTimestamp(db, feed.id, cacheHeaders);

  const ogpLimit = envLimit(env.OGP_MAX_ITEMS_PER_FEED, 10);
  const summaryLimit = envLimit(env.SUMMARY_MAX_ITEMS_PER_FEED, 10);

  if (!skipOgp) {
    runBackgroundTask(ctx, updateOgp(db, inserted.slice(0, ogpLimit), feed.id));
  }

  if (inserted.length > 0) {
    runBackgroundTask(
      ctx,
      summarizeEntries(db, inserted.slice(0, summaryLimit), feed.feedType, env),
    );
  }
}

type InsertedEntry = {
  id: string;
  url: string | null;
  contentText: string | null;
  ogImageUrl: string | null;
};

async function updateOgp(db: Db, inserted: InsertedEntry[], feedId: string): Promise<void> {
  const needsOgp = inserted.filter((e) => !e.ogImageUrl && e.url);
  if (needsOgp.length === 0) return;

  try {
    const images = await fetchOgImages(needsOgp.map((e) => ({ url: e.url ?? undefined })));
    for (let i = 0; i < needsOgp.length; i++) {
      if (images[i]) {
        await db
          .update(entries)
          .set({ ogImageUrl: images[i] })
          .where(eq(entries.id, needsOgp[i].id));
      }
    }
    console.log(`[feedFetcher] OGP images updated for feed ${feedId}`);
  } catch (error) {
    console.error("[feedFetcher] OGP fetch failed:", error);
  }
}

async function summarizeEntries(
  db: Db,
  inserted: InsertedEntry[],
  feedType: Feed["feedType"],
  env: AppEnv,
): Promise<void> {
  if (inserted.length === 0) return;

  try {
    const summaries = await summarizeItems(
      inserted.map((e) => ({ id: e.id, text: e.contentText })),
      feedType,
      env,
    );
    console.log(
      `[feedFetcher] summarization done: ${summaries.size}/${inserted.length} items got summaries`,
    );
    for (const e of inserted) {
      const summaryResult = summaries.get(e.id);
      if (summaryResult) {
        const summaryStatus = deriveSummaryStatus(summaryResult, feedType);
        await db
          .update(entries)
          .set({
            summary: summaryResult.summary,
            detailedSummary: summaryResult.detailedSummary ?? null,
            summaryStatus,
          })
          .where(eq(entries.id, e.id));
      } else {
        await db.update(entries).set({ summaryStatus: "failed" }).where(eq(entries.id, e.id));
      }
    }
  } catch (error) {
    console.error("[feedFetcher] background summarization failed:", error);
    for (const e of inserted) {
      await db.update(entries).set({ summaryStatus: "failed" }).where(eq(entries.id, e.id));
    }
  }
}
