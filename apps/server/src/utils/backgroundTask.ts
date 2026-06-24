export function runBackgroundTask(ctx: ExecutionContext | undefined, task: Promise<unknown>): void {
  if (ctx) {
    ctx.waitUntil(task);
    return;
  }
  void task;
}
