import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const feedTypes = ["rss", "atom", "github-releases"] as const;
export const summaryStatuses = ["pending", "completed", "failed", "skipped"] as const;

export type FeedType = (typeof feedTypes)[number];
export type SummaryStatus = (typeof summaryStatuses)[number];

export const feeds = sqliteTable("feeds", {
  id: text("id")
    .$defaultFn(() => randomUUID())
    .primaryKey(),
  url: text("url").notNull().unique(),
  title: text("title"),
  siteUrl: text("site_url"),
  feedType: text("feed_type", { enum: feedTypes }).notNull().default("rss"),
  description: text("description"),
  iconUrl: text("icon_url"),
  lastFetchedAt: integer("last_fetched_at", { mode: "timestamp" }),
  lastEtag: text("last_etag"),
  lastModified: text("last_modified"),
  fetchIntervalMinutes: integer("fetch_interval_minutes").notNull().default(60),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const entries = sqliteTable(
  "entries",
  {
    id: text("id")
      .$defaultFn(() => randomUUID())
      .primaryKey(),
    feedId: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    title: text("title"),
    url: text("url"),
    contentHtml: text("content_html"),
    contentText: text("content_text"),
    author: text("author"),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    isReadLater: integer("is_read_later", { mode: "boolean" }).notNull().default(false),
    guid: text("guid").notNull(),
    ogImageUrl: text("og_image_url"),
    summary: text("summary"),
    detailedSummary: text("detailed_summary"),
    summaryStatus: text("summary_status", { enum: summaryStatuses }).notNull().default("pending"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("entries_feed_guid_unique").on(table.feedId, table.guid)],
);
