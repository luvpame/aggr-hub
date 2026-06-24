import { Hono } from "hono";
import { eq, desc, and, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AppEnv, Db } from "../db/d1.js";
import { entries, feeds } from "../db/schema.js";
import {
  decodeEntryCursor,
  encodeEntryCursor,
  getEntryCursorCondition,
} from "../db/paginationCursor.js";
import { summarizeItems } from "../services/summarizer.js";
import { runBackgroundTask } from "../utils/backgroundTask.js";

async function batchUpdateEntries(
  db: Db,
  entryIds: string[],
  data: Partial<typeof entries.$inferInsert>,
): Promise<void> {
  await db.update(entries).set(data).where(inArray(entries.id, entryIds));
}

async function bulkUpdateEntries(
  db: Db,
  data: Partial<typeof entries.$inferInsert>,
  baseCondition: SQL,
  feedId?: string,
): Promise<void> {
  const conditions = [baseCondition];
  if (feedId) {
    conditions.push(eq(entries.feedId, feedId));
  }
  await db
    .update(entries)
    .set(data)
    .where(and(...conditions));
}

function getSummaryStatus(
  result: { skipped?: boolean; detailedSummary?: string | null },
  feedType?: string,
): "skipped" | "completed" | "failed" {
  if (result.skipped) return "skipped";
  if (feedType === "github-releases" && !result.detailedSummary) return "failed";
  return "completed";
}

export function createEntryRoutes(db: Db, env: AppEnv = {}, ctx?: ExecutionContext): Hono {
  return new Hono()
    .get("/entries", async (c) => {
      const feedId = c.req.query("feedId");
      const isRead = c.req.query("isRead");
      const isFavorite = c.req.query("isFavorite");
      const isReadLater = c.req.query("isReadLater");
      const cursor = c.req.query("cursor");
      const limit = Math.min(Number(c.req.query("limit") ?? 30), 100);

      const conditions = [];

      if (feedId) {
        conditions.push(eq(entries.feedId, feedId));
      }
      if (isRead !== undefined && isRead !== "") {
        conditions.push(eq(entries.isRead, isRead === "true"));
      }
      if (isFavorite !== undefined && isFavorite !== "") {
        conditions.push(eq(entries.isFavorite, isFavorite === "true"));
      }
      if (isReadLater !== undefined && isReadLater !== "") {
        conditions.push(eq(entries.isReadLater, isReadLater === "true"));
      }
      if (cursor) {
        const decoded = decodeEntryCursor(cursor);
        if (!decoded) {
          return c.json({ error: "Invalid cursor" }, 400);
        }
        conditions.push(getEntryCursorCondition(decoded));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await db
        .select()
        .from(entries)
        .where(where)
        .orderBy(desc(entries.publishedAt), desc(entries.id))
        .limit(limit + 1);

      const hasMore = results.length > limit;
      const data = hasMore ? results.slice(0, limit) : results;

      let nextCursor: string | null = null;
      if (hasMore && data.length > 0) {
        const last = data[data.length - 1];
        nextCursor = encodeEntryCursor(last.publishedAt, last.id);
      }

      return c.json({ data, nextCursor, hasMore });
    })

    .get("/entries/:id", async (c) => {
      const id = c.req.param("id");
      const [entry] = await db.select().from(entries).where(eq(entries.id, id));
      if (!entry) return c.json({ error: "Entry not found" }, 404);
      return c.json(entry);
    })

    .patch("/entries/:id", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json<{
        isRead?: boolean;
        isFavorite?: boolean;
        isReadLater?: boolean;
      }>();

      const [updated] = await db.update(entries).set(body).where(eq(entries.id, id)).returning();

      if (!updated) return c.json({ error: "Entry not found" }, 404);
      return c.json(updated);
    })

    .post("/entries/mark-read", async (c) => {
      const body = await c.req.json<{ entryIds: string[] }>();
      await batchUpdateEntries(db, body.entryIds, { isRead: true });
      return c.json({ success: true });
    })

    .post("/entries/mark-unread", async (c) => {
      const body = await c.req.json<{ entryIds: string[] }>();
      await batchUpdateEntries(db, body.entryIds, { isRead: false });
      return c.json({ success: true });
    })

    .post("/entries/mark-all-read", async (c) => {
      const body = await c.req.json<{ feedId?: string }>();
      await bulkUpdateEntries(db, { isRead: true }, eq(entries.isRead, false), body.feedId);
      return c.json({ success: true });
    })

    .post("/entries/mark-unfavorite", async (c) => {
      const body = await c.req.json<{ entryIds: string[] }>();
      await batchUpdateEntries(db, body.entryIds, { isFavorite: false });
      return c.json({ success: true });
    })

    .post("/entries/mark-unread-later", async (c) => {
      const body = await c.req.json<{ entryIds: string[] }>();
      await batchUpdateEntries(db, body.entryIds, { isReadLater: false });
      return c.json({ success: true });
    })

    .post("/entries/mark-all-unread", async (c) => {
      const body = await c.req.json<{ feedId?: string }>();
      await bulkUpdateEntries(db, { isRead: false }, eq(entries.isRead, true), body.feedId);
      return c.json({ success: true });
    })

    .post("/entries/:id/retry-summary", async (c) => {
      const id = c.req.param("id");
      const [entry] = await db.select().from(entries).where(eq(entries.id, id));
      if (!entry) return c.json({ error: "Entry not found" }, 404);

      const [feed] = await db.select().from(feeds).where(eq(feeds.id, entry.feedId));

      await db
        .update(entries)
        .set({ summaryStatus: "pending", summary: null, detailedSummary: null })
        .where(eq(entries.id, id));

      const task = summarizeItems([{ id: entry.id, text: entry.contentText }], feed?.feedType, env)
        .then(async (summaries) => {
          const result = summaries.get(entry.id);
          if (result) {
            const summaryStatus = getSummaryStatus(result, feed?.feedType);
            await db
              .update(entries)
              .set({
                summary: result.summary,
                detailedSummary: result.detailedSummary ?? null,
                summaryStatus,
              })
              .where(eq(entries.id, entry.id));
          } else {
            await db
              .update(entries)
              .set({ summaryStatus: "failed" })
              .where(eq(entries.id, entry.id));
          }
        })
        .catch(async (error) => {
          console.error("Retry summarization failed:", error);
          await db.update(entries).set({ summaryStatus: "failed" }).where(eq(entries.id, entry.id));
        });
      runBackgroundTask(ctx, task);

      return c.json({ success: true });
    });
}
