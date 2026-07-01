import { eq } from "drizzle-orm";
import type { AppEnv, Db } from "../db/d1.js";
import { feeds, entries, type feeds as FeedsTable } from "../db/schema.js";
import { enqueueEntryEnrichment, getEntryEnrichmentLimit } from "./entryEnrichment.js";
import { parseRssFeed } from "./rssParser.js";

type Feed = typeof FeedsTable.$inferSelect;
const ENTRY_INSERT_BATCH_SIZE = 5;

export async function fetchAndStoreFeed(
  db: Db,
  feed: Feed,
  env: AppEnv = {},
  _ctx?: ExecutionContext,
): Promise<void> {
  await fetchRssFeed(db, feed, env);
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

async function fetchRssFeed(db: Db, feed: Feed, env: AppEnv): Promise<void> {
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
      })),
    );
  }

  console.log(`[feedFetcher] inserted ${inserted.length} new entries for feed ${feed.id}`);

  await updateFeedTimestamp(db, feed.id, cacheHeaders);

  await enqueueEntryEnrichment(
    env.ENTRY_ENRICHMENT_QUEUE,
    inserted.slice(0, getEntryEnrichmentLimit(env, feed.feedType)).map((entry) => entry.id),
  );
}
