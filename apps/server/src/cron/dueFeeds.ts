export function getDueFeedCutoff(intervalMinutes: number, now = new Date()): Date {
  return new Date(now.getTime() - intervalMinutes * 60_000);
}
