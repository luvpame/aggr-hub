export function getDueFeedCutoff(intervalMinutes: number, now = new Date()): Date {
  return new Date(now.getTime() - intervalMinutes * 60_000);
}

type DueFeed = {
  lastFetchedAt: Date | null;
  fetchIntervalMinutes: number;
  createdAt: Date;
};

function dueFeedTime(feed: DueFeed): number {
  return feed.lastFetchedAt?.getTime() ?? 0;
}

export function selectDueFeedBatch<T extends DueFeed>(feeds: T[], now: Date, limit: number): T[] {
  return feeds
    .filter(
      (feed) =>
        feed.lastFetchedAt === null ||
        feed.lastFetchedAt < getDueFeedCutoff(feed.fetchIntervalMinutes, now),
    )
    .sort(
      (a, b) => dueFeedTime(a) - dueFeedTime(b) || a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .slice(0, limit);
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
