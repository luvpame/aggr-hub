import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import postgres from "postgres";
import { entries, feeds } from "../db/schema.js";

type PostgresValue = string | number | boolean | Date | null | undefined;
type PostgresRow = Record<string, PostgresValue>;

export function normalizePostgresBoolean(value: PostgresValue): boolean {
  return value === true || value === 1;
}

export function normalizePostgresDate(value: PostgresValue): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function nullableText(value: PostgresValue): string | null {
  return value === null || value === undefined ? null : String(value);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function mapFeed(row: PostgresRow): typeof feeds.$inferInsert {
  return {
    id: String(row.id),
    url: String(row.url),
    title: nullableText(row.title),
    siteUrl: nullableText(row.site_url),
    feedType: row.feed_type as typeof feeds.$inferInsert.feedType,
    description: nullableText(row.description),
    iconUrl: nullableText(row.icon_url),
    lastFetchedAt: normalizePostgresDate(row.last_fetched_at),
    lastEtag: nullableText(row.last_etag),
    lastModified: nullableText(row.last_modified),
    fetchIntervalMinutes: Number(row.fetch_interval_minutes),
    isActive: normalizePostgresBoolean(row.is_active),
    createdAt: normalizePostgresDate(row.created_at) ?? new Date(),
    updatedAt: normalizePostgresDate(row.updated_at) ?? new Date(),
  };
}

function mapEntry(row: PostgresRow): typeof entries.$inferInsert {
  return {
    id: String(row.id),
    feedId: String(row.feed_id),
    title: nullableText(row.title),
    url: nullableText(row.url),
    contentHtml: nullableText(row.content_html),
    contentText: nullableText(row.content_text),
    author: nullableText(row.author),
    publishedAt: normalizePostgresDate(row.published_at),
    isRead: normalizePostgresBoolean(row.is_read),
    isFavorite: normalizePostgresBoolean(row.is_favorite),
    isReadLater: normalizePostgresBoolean(row.is_read_later),
    guid: String(row.guid),
    ogImageUrl: nullableText(row.og_image_url),
    summary: nullableText(row.summary),
    detailedSummary: nullableText(row.detailed_summary),
    summaryStatus: row.summary_status as typeof entries.$inferInsert.summaryStatus,
    createdAt: normalizePostgresDate(row.created_at) ?? new Date(),
  };
}

export async function migratePostgresToSqlite(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  const sqlitePath = requireEnv("SQLITE_DB_PATH");

  mkdirSync(dirname(sqlitePath), { recursive: true });

  const source = postgres(databaseUrl);
  const sqlite = new Database(sqlitePath);
  sqlite.pragma("foreign_keys = ON");

  const destination = drizzle(sqlite);

  try {
    const sourceFeeds = await source<PostgresRow[]>`select * from feeds order by created_at`;
    const sourceEntries = await source<PostgresRow[]>`select * from entries order by created_at`;

    if (sourceFeeds.length > 0) {
      await destination.insert(feeds).values(sourceFeeds.map(mapFeed)).onConflictDoNothing();
    }

    if (sourceEntries.length > 0) {
      await destination.insert(entries).values(sourceEntries.map(mapEntry)).onConflictDoNothing();
    }

    console.log(`Migrated ${sourceFeeds.length} feeds and ${sourceEntries.length} entries`);
  } finally {
    await source.end();
    sqlite.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migratePostgresToSqlite().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
