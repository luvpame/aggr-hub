import { describe, expect, test } from "vite-plus/test";
import { decodeEntryCursor, encodeEntryCursor } from "./paginationCursor.js";

describe("decodeEntryCursor", () => {
  test("decodes published timestamp and id", () => {
    const cursor = encodeEntryCursor(new Date("2026-05-20T12:00:00.000Z"), "entry-1");
    expect(decodeEntryCursor(cursor)).toEqual({
      id: "entry-1",
      publishedAt: new Date("2026-05-20T12:00:00.000Z"),
    });
  });

  test("returns null for invalid cursor", () => {
    expect(decodeEntryCursor("not-base64")).toBeNull();
  });
});
