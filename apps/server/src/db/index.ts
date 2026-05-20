import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrateSqlite } from "../scripts/migrateSqlite.js";
import * as schema from "./schema.js";

const sqlitePath = process.env.SQLITE_DB_PATH ?? "./aggr-hub.sqlite";

mkdirSync(dirname(sqlitePath), { recursive: true });
migrateSqlite(sqlitePath);

const client = new Database(sqlitePath);

client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client, { schema });
