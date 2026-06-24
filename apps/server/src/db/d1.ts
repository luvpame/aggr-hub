import { drizzle } from "drizzle-orm/d1";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema.js";

export type AppEnv = {
  SUMMARY_API_BASE_URL?: string;
  SUMMARY_API_KEY?: string;
  SUMMARY_MODEL?: string;
  CRON_MAX_FEEDS?: string;
  OGP_MAX_ITEMS_PER_FEED?: string;
  SUMMARY_MAX_ITEMS_PER_FEED?: string;
  OPENAI_API_KEY?: string;
};

export type WorkerEnv = Env & AppEnv;

export type Db = BaseSQLiteDatabase<"sync" | "async", unknown, typeof schema>;

export function createDb(env: WorkerEnv): Db {
  return drizzle(env.DB, { schema });
}
