import { createApp } from "./app.js";
import { runScheduledRefresh } from "./cron/scheduler.js";
import { createDb, type WorkerEnv } from "./db/d1.js";

export default {
  fetch(request, env, ctx) {
    const app = createApp(createDb(env), env, ctx);
    return app.fetch(request, env, ctx);
  },

  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledRefresh(createDb(env), env, ctx));
  },
} satisfies ExportedHandler<WorkerEnv>;
