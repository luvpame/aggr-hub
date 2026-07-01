import { createApp } from "./app.js";
import { runScheduledRefresh } from "./cron/scheduler.js";
import { createDb, type WorkerEnv } from "./db/d1.js";
import {
  processEntryEnrichmentBatch,
  type EntryEnrichmentMessage,
} from "./services/entryEnrichment.js";

export default {
  fetch(request, env, ctx) {
    const app = createApp(createDb(env), env, ctx);
    return app.fetch(request, env, ctx);
  },

  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduledRefresh(createDb(env), env, ctx));
  },

  queue(batch, env, ctx) {
    ctx.waitUntil(processEntryEnrichmentBatch(createDb(env), batch.messages, env));
  },
} satisfies ExportedHandler<WorkerEnv, EntryEnrichmentMessage>;
