import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv, Db } from "../db/d1.js";
import { feeds } from "../db/schema.js";
import { fetchAndStoreFeed } from "../services/feedFetcher.js";
import { detectAndParseFeed } from "../services/feedDetector.js";

export function createFeedRoutes(db: Db, env: AppEnv = {}, ctx?: ExecutionContext): Hono {
  return new Hono()
    .get("/feeds", async (c) => {
      const allFeeds = await db.select().from(feeds).orderBy(feeds.createdAt);
      return c.json(allFeeds);
    })

    .post("/feeds", async (c) => {
      const body = await c.req.json<{ url: string }>();

      const detected = await detectAndParseFeed(body.url);

      const [feed] = await db
        .insert(feeds)
        .values({
          url: detected.feedUrl,
          title: detected.title,
          siteUrl: detected.siteUrl,
          feedType: detected.feedType,
          description: detected.description,
        })
        .returning();

      await fetchAndStoreFeed(db, feed, env, ctx);

      return c.json(feed, 201);
    })

    .get("/feeds/:id", async (c) => {
      const id = c.req.param("id");
      const [feed] = await db.select().from(feeds).where(eq(feeds.id, id));
      if (!feed) return c.json({ error: "Feed not found" }, 404);
      return c.json(feed);
    })

    .patch("/feeds/:id", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json<{
        title?: string;
        fetchIntervalMinutes?: number;
        isActive?: boolean;
      }>();

      const [updated] = await db
        .update(feeds)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(feeds.id, id))
        .returning();

      if (!updated) return c.json({ error: "Feed not found" }, 404);
      return c.json(updated);
    })

    .delete("/feeds/:id", async (c) => {
      const id = c.req.param("id");
      const [deleted] = await db.delete(feeds).where(eq(feeds.id, id)).returning();
      if (!deleted) return c.json({ error: "Feed not found" }, 404);
      return c.json({ success: true });
    })

    .post("/feeds/:id/refresh", async (c) => {
      const id = c.req.param("id");
      const [feed] = await db.select().from(feeds).where(eq(feeds.id, id));
      if (!feed) return c.json({ error: "Feed not found" }, 404);

      await fetchAndStoreFeed(db, feed, env, ctx);
      return c.json({ success: true });
    });
}
