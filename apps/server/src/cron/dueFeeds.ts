export function getDueFeedCutoff(intervalMinutes: number, now = new Date()): Date {
  return new Date(now.getTime() - intervalMinutes * 60_000);
}

export const FEED_REFRESH_CONCURRENCY = 2;

export async function processDueFeeds<T>(
  dueFeeds: T[],
  refreshFeed: (feed: T) => Promise<void>,
  concurrency = FEED_REFRESH_CONCURRENCY,
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = Array.from({ length: dueFeeds.length });
  let index = 0;

  async function worker(): Promise<void> {
    while (index < dueFeeds.length) {
      const i = index++;
      try {
        await refreshFeed(dueFeeds[i]);
        results[i] = { status: "fulfilled", value: undefined };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  const workerCount = Math.min(concurrency, dueFeeds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
