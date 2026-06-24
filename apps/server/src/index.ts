try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {}

import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { db } from "./db/index.js";
import type { AppEnv } from "./db/d1.js";
import { startScheduler } from "./cron/scheduler.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp(db, process.env as AppEnv);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

startScheduler(db, process.env as AppEnv);
