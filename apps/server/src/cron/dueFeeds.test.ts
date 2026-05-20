import { describe, expect, test } from "vite-plus/test";
import { getDueFeedCutoff } from "./dueFeeds.js";

describe("getDueFeedCutoff", () => {
  test("subtracts fetch interval from current time", () => {
    const now = new Date("2026-05-20T12:00:00.000Z");
    expect(getDueFeedCutoff(60, now).toISOString()).toBe("2026-05-20T11:00:00.000Z");
  });
});
