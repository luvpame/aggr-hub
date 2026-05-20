# SQLite Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Aggr Hub runtime storage from PostgreSQL to SQLite and provide a one-time PostgreSQL data import command.

**Architecture:** The server uses a single SQLite database file through Drizzle's SQLite driver. Existing PostgreSQL runtime code is removed; PostgreSQL remains only as the source driver for the import script.

**Tech Stack:** Node 24, Hono, Drizzle ORM, better-sqlite3, postgres, Vite+, Vitest through `vite-plus/test`.

---

## File Structure

- Modify `apps/server/package.json`: replace runtime DB dependency with `better-sqlite3`, keep `postgres` for the migration script, add migration scripts.
- Modify `apps/server/src/db/schema.ts`: convert `pg-core` schema to `sqlite-core`.
- Modify `apps/server/src/db/index.ts`: open a SQLite file and export the Drizzle client.
- Modify `apps/server/drizzle.config.ts`: point Drizzle Kit at SQLite.
- Create `apps/server/src/db/sqliteMigrations.test.ts`: verifies SQLite migrations create the needed constraints.
- Create `apps/server/src/db/paginationCursor.ts`: SQLite-compatible pagination cursor condition helper.
- Create `apps/server/src/db/paginationCursor.test.ts`: verifies cursor decoding and condition shape through route behavior helpers.
- Modify `apps/server/src/routes/entries.ts`: use the helper for cursor pagination.
- Create `apps/server/src/cron/dueFeeds.ts`: app-side due-feed cutoff helper.
- Create `apps/server/src/cron/dueFeeds.test.ts`: verifies cutoff calculation.
- Modify `apps/server/src/cron/scheduler.ts`: remove PostgreSQL interval SQL.
- Create `apps/server/src/scripts/migratePostgresToSqlite.ts`: one-time import from PostgreSQL to SQLite.
- Create `apps/server/src/scripts/migratePostgresToSqlite.test.ts`: verifies row mapping without connecting to PostgreSQL.
- Modify `compose.yml`: remove PostgreSQL service and mount SQLite data volume.
- Modify `vite.config.ts`: remove PostgreSQL dev tasks and run dev server directly.
- Modify `apps/server/.env.example`: document `SQLITE_DB_PATH`.
- Modify `README.md`: update database stack and migration instructions.

## Task 1: Dependencies and SQLite Schema

**Files:**

- Modify: `apps/server/package.json`
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/src/db/index.ts`
- Modify: `apps/server/drizzle.config.ts`
- Test: `apps/server/src/db/sqliteMigrations.test.ts`

- [ ] **Step 1: Write failing migration test**

Create `apps/server/src/db/sqliteMigrations.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vite-plus/test";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("SQLite schema", () => {
  test("creates feeds and entries with expected constraints", () => {
    tempDir = mkdtempSync(join(tmpdir(), "aggr-hub-db-"));
    mkdirSync(tempDir, { recursive: true });
    const sqlite = new Database(join(tempDir, "test.sqlite"));

    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE feeds (
        id text PRIMARY KEY NOT NULL,
        url text NOT NULL,
        title text,
        site_url text,
        feed_type text NOT NULL DEFAULT 'rss',
        description text,
        icon_url text,
        last_fetched_at integer,
        last_etag text,
        last_modified text,
        fetch_interval_minutes integer NOT NULL DEFAULT 60,
        is_active integer NOT NULL DEFAULT 1,
        created_at integer NOT NULL,
        updated_at integer NOT NULL
      );
      CREATE UNIQUE INDEX feeds_url_unique ON feeds (url);
      CREATE TABLE entries (
        id text PRIMARY KEY NOT NULL,
        feed_id text NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
        title text,
        url text,
        content_html text,
        content_text text,
        author text,
        published_at integer,
        is_read integer NOT NULL DEFAULT 0,
        is_favorite integer NOT NULL DEFAULT 0,
        is_read_later integer NOT NULL DEFAULT 0,
        guid text NOT NULL,
        og_image_url text,
        summary text,
        detailed_summary text,
        summary_status text NOT NULL DEFAULT 'pending',
        created_at integer NOT NULL
      );
      CREATE UNIQUE INDEX entries_feed_guid_unique ON entries (feed_id, guid);
    `);

    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    expect(tables).toContainEqual({ name: "feeds" });
    expect(tables).toContainEqual({ name: "entries" });

    sqlite.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/server/src/db/sqliteMigrations.test.ts`

Expected: FAIL because `better-sqlite3` is not installed.

- [ ] **Step 3: Add dependencies and convert schema**

Run: `vp add -F server better-sqlite3 @types/better-sqlite3`

Then update schema to `sqliteTable`, `text`, `integer`, `uniqueIndex`, and timestamp/boolean modes. Update `index.ts` to use `drizzle-orm/better-sqlite3` and `better-sqlite3`. Update `drizzle.config.ts` to `dialect: "sqlite"` with `url: process.env.SQLITE_DB_PATH ?? "./aggr-hub.sqlite"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `vp test apps/server/src/db/sqliteMigrations.test.ts`

Expected: PASS.

## Task 2: SQLite-Compatible Queries

**Files:**

- Create: `apps/server/src/db/paginationCursor.ts`
- Create: `apps/server/src/db/paginationCursor.test.ts`
- Create: `apps/server/src/cron/dueFeeds.ts`
- Create: `apps/server/src/cron/dueFeeds.test.ts`
- Modify: `apps/server/src/routes/entries.ts`
- Modify: `apps/server/src/cron/scheduler.ts`

- [ ] **Step 1: Write failing helper tests**

Create `apps/server/src/cron/dueFeeds.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { getDueFeedCutoff } from "./dueFeeds.js";

describe("getDueFeedCutoff", () => {
  test("subtracts fetch interval from current time", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");
    expect(getDueFeedCutoff(60, now).toISOString()).toBe("2026-05-20T11:00:00.000Z");
  });
});
```

Create `apps/server/src/db/paginationCursor.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { decodeEntryCursor } from "./paginationCursor.js";

describe("decodeEntryCursor", () => {
  test("decodes published timestamp and id", () => {
    const cursor = Buffer.from("2026-05-20T12:00:00.000Z|entry-1").toString("base64");
    expect(decodeEntryCursor(cursor)).toEqual({
      id: "entry-1",
      publishedAt: new Date("2026-05-20T12:00:00.000Z"),
    });
  });

  test("returns null for invalid cursor", () => {
    expect(decodeEntryCursor("not-base64")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test apps/server/src/cron/dueFeeds.test.ts apps/server/src/db/paginationCursor.test.ts`

Expected: FAIL because helper modules do not exist.

- [ ] **Step 3: Implement helpers and update callers**

`getDueFeedCutoff(intervalMinutes, now)` returns `new Date(now.getTime() - intervalMinutes * 60_000)`.

`decodeEntryCursor(cursor)` returns `{ publishedAt: Date, id: string } | null`. The route uses an SQLite-compatible condition:

```ts
or(
  lt(entries.publishedAt, decoded.publishedAt),
  and(eq(entries.publishedAt, decoded.publishedAt), lt(entries.id, decoded.id)),
);
```

The scheduler loads active feeds and filters due feeds with Drizzle conditions using app-calculated cutoffs instead of PostgreSQL interval SQL.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp test apps/server/src/cron/dueFeeds.test.ts apps/server/src/db/paginationCursor.test.ts`

Expected: PASS.

## Task 3: PostgreSQL to SQLite Import Script

**Files:**

- Create: `apps/server/src/scripts/migratePostgresToSqlite.ts`
- Create: `apps/server/src/scripts/migratePostgresToSqlite.test.ts`
- Modify: `apps/server/package.json`

- [ ] **Step 1: Write failing mapper test**

Create `apps/server/src/scripts/migratePostgresToSqlite.test.ts`:

```ts
import { describe, expect, test } from "vite-plus/test";
import { normalizePostgresBoolean, normalizePostgresDate } from "./migratePostgresToSqlite.js";

describe("PostgreSQL to SQLite migration mapping", () => {
  test("normalizes booleans from PostgreSQL-compatible values", () => {
    expect(normalizePostgresBoolean(true)).toBe(true);
    expect(normalizePostgresBoolean(false)).toBe(false);
    expect(normalizePostgresBoolean(1)).toBe(true);
    expect(normalizePostgresBoolean(0)).toBe(false);
  });

  test("normalizes dates from Date, string, and null values", () => {
    expect(normalizePostgresDate(new Date("2026-05-20T12:00:00.000Z"))).toEqual(
      new Date("2026-05-20T12:00:00.000Z"),
    );
    expect(normalizePostgresDate("2026-05-20T12:00:00.000Z")).toEqual(
      new Date("2026-05-20T12:00:00.000Z"),
    );
    expect(normalizePostgresDate(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test apps/server/src/scripts/migratePostgresToSqlite.test.ts`

Expected: FAIL because migration script does not exist.

- [ ] **Step 3: Implement import script**

Export `normalizePostgresBoolean` and `normalizePostgresDate`. In CLI mode, read `DATABASE_URL` and `SQLITE_DB_PATH`, select all rows from PostgreSQL tables, and insert them into SQLite with `onConflictDoNothing()`.

Add script:

```json
"db:migrate:from-postgres": "tsx src/scripts/migratePostgresToSqlite.ts"
```

- [ ] **Step 4: Run mapper test**

Run: `vp test apps/server/src/scripts/migratePostgresToSqlite.test.ts`

Expected: PASS.

## Task 4: Runtime and Documentation

**Files:**

- Modify: `compose.yml`
- Modify: `vite.config.ts`
- Modify: `apps/server/.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update runtime configuration**

Remove the `postgres` service from `compose.yml`, set `SQLITE_DB_PATH=/data/aggr-hub.sqlite` on the server, and add a named volume `sqlite-data:/data`.

Update `vite.config.ts` dev tasks so `dev:up` starts `server#dev` and `web#dev` without `docker compose up -d postgres`.

- [ ] **Step 2: Update docs**

README should state SQLite is the database, remove PostgreSQL from prerequisites, and include:

```bash
vp run server#db:migrate
DATABASE_URL=postgres://aggrhub:aggrhub@localhost:5432/aggrhub SQLITE_DB_PATH=./aggr-hub.sqlite vp run server#db:migrate:from-postgres
```

`.env.example` should include:

```env
SQLITE_DB_PATH=./aggr-hub.sqlite
```

## Task 5: Simplify, Verify, Commit

**Files:**

- All modified files

- [ ] **Step 1: Apply code-simplifier review**

Read the `code-simplifier` skill and simplify only recently modified code. Do not add compatibility shims.

- [ ] **Step 2: Install dependencies**

Run: `vp install`

Expected: lockfile is updated and dependencies are installed.

- [ ] **Step 3: Run full verification**

Run:

```bash
vp check
vp test
vp run server#build
```

Expected: all pass.

- [ ] **Step 4: Commit**

Run:

```bash
git status --short
git add apps/server/package.json apps/server/src apps/server/drizzle.config.ts compose.yml vite.config.ts apps/server/.env.example README.md pnpm-lock.yaml docs/superpowers/plans/2026-05-20-sqlite-migration.md
git commit -m "feat(server): SQLiteへ移行"
```
