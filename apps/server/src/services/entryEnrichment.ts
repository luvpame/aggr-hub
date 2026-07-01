import { eq } from "drizzle-orm";
import type { AppEnv, Db } from "../db/d1.js";
import { entries, feeds, type feeds as FeedsTable } from "../db/schema.js";
import { fetchOgImages } from "./ogpFetcher.js";
import { summarizeItems } from "./summarizer.js";

type Feed = typeof FeedsTable.$inferSelect;
type Entry = typeof entries.$inferSelect;

export type EntryEnrichmentMessage = {
  entryId: string;
};

export type EntryEnrichmentQueue = Queue<EntryEnrichmentMessage>;

function envLimit(value: string | undefined, fallback: number): number {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(0, limit);
}

export function getEntryEnrichmentLimit(env: AppEnv, feedType: Feed["feedType"]): number {
  const ogpLimit = feedType === "github-releases" ? 0 : envLimit(env.OGP_MAX_ITEMS_PER_FEED, 10);
  const summaryLimit = envLimit(env.SUMMARY_MAX_ITEMS_PER_FEED, 10);
  return Math.max(ogpLimit, summaryLimit);
}

export async function enqueueEntryEnrichment(
  queue: EntryEnrichmentQueue | undefined,
  entryIds: string[],
): Promise<void> {
  const uniqueEntryIds = [...new Set(entryIds)];
  if (!queue || uniqueEntryIds.length === 0) return;

  await queue.sendBatch(uniqueEntryIds.map((entryId) => ({ body: { entryId } })));
}

function deriveSummaryStatus(
  result: { skipped?: boolean; detailedSummary?: string | null },
  feedType?: Feed["feedType"],
): "skipped" | "completed" | "failed" {
  if (result.skipped) return "skipped";
  if (feedType === "github-releases" && !result.detailedSummary) return "failed";
  return "completed";
}

async function updateOgp(db: Db, entry: Entry): Promise<void> {
  if (entry.ogImageUrl || !entry.url) return;

  try {
    const [image] = await fetchOgImages([{ url: entry.url }]);
    if (image) {
      await db.update(entries).set({ ogImageUrl: image }).where(eq(entries.id, entry.id));
    }
  } catch (error) {
    console.error("[entryEnrichment] OGP fetch failed:", error);
  }
}

async function summarizeEntry(
  db: Db,
  entry: Entry,
  feedType: Feed["feedType"] | undefined,
  env: AppEnv,
): Promise<void> {
  try {
    const summaries = await summarizeItems(
      [{ id: entry.id, text: entry.contentText }],
      feedType,
      env,
    );
    const result = summaries.get(entry.id);
    if (result) {
      await db
        .update(entries)
        .set({
          summary: result.summary,
          detailedSummary: result.detailedSummary ?? null,
          summaryStatus: deriveSummaryStatus(result, feedType),
        })
        .where(eq(entries.id, entry.id));
      return;
    }
  } catch (error) {
    console.error("[entryEnrichment] summarization failed:", error);
  }

  await db.update(entries).set({ summaryStatus: "failed" }).where(eq(entries.id, entry.id));
}

async function processEntryEnrichment(db: Db, entryId: string, env: AppEnv): Promise<void> {
  const [entry] = await db.select().from(entries).where(eq(entries.id, entryId));
  if (!entry) return;

  const [feed] = await db.select().from(feeds).where(eq(feeds.id, entry.feedId));
  const feedType = feed?.feedType;

  if (feedType !== "github-releases" && envLimit(env.OGP_MAX_ITEMS_PER_FEED, 10) > 0) {
    await updateOgp(db, entry);
  }

  if (envLimit(env.SUMMARY_MAX_ITEMS_PER_FEED, 10) > 0) {
    await summarizeEntry(db, entry, feedType, env);
  }
}

export async function processEntryEnrichmentBatch(
  db: Db,
  messages: readonly Message<EntryEnrichmentMessage>[],
  env: AppEnv,
): Promise<void> {
  const results = await Promise.allSettled(
    messages.map((message) => processEntryEnrichment(db, message.body.entryId, env)),
  );
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[entryEnrichment] failed to process message:", result.reason);
    }
  }
}
