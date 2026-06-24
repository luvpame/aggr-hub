import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { AppEnv, Db } from "./db/d1.js";
import { createFeedRoutes } from "./routes/feeds.js";
import { createEntryRoutes } from "./routes/entries.js";
import { healthRoutes } from "./routes/health.js";

export function createApp(db: Db, env: AppEnv = {}, ctx?: ExecutionContext): Hono {
  return new Hono()
    .use("*", logger())
    .use("/api/*", cors({ origin: "http://localhost:5173" }))
    .route("/api/v1", healthRoutes)
    .route("/api/v1", createFeedRoutes(db, env, ctx))
    .route("/api/v1", createEntryRoutes(db, env, ctx));
}

export type AppType = ReturnType<typeof createApp>;
