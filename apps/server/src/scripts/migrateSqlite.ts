import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

type MigrationRow = {
  hash: string;
};

function resolveMigrationsDir(): string {
  const localDir = join(process.cwd(), "drizzle-sqlite");
  if (existsSync(localDir)) return localDir;
  return join(process.cwd(), "apps/server/drizzle-sqlite");
}

function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function migrateSqlite(
  sqlitePath = process.env.SQLITE_DB_PATH ?? "./aggr-hub.sqlite",
): void {
  const sqlite = new Database(sqlitePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id integer PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL UNIQUE,
      created_at integer NOT NULL
    )
  `);

  const applied = new Set(
    (sqlite.prepare("SELECT hash FROM __drizzle_migrations").all() as MigrationRow[]).map(
      (row) => row.hash,
    ),
  );

  const migrationsDir = resolveMigrationsDir();
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const applyMigration = sqlite.transaction((file: string) => {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    for (const statement of splitStatements(sql)) {
      sqlite.exec(statement);
    }
    sqlite
      .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
      .run(file, Date.now());
  });

  for (const file of files) {
    if (!applied.has(file)) applyMigration(file);
  }

  sqlite.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrateSqlite();
}
