import { and, eq, lt, or } from "drizzle-orm";
import { entries } from "./schema.js";

export type EntryCursor = {
  id: string;
  publishedAt: Date;
};

export function decodeEntryCursor(cursor: string): EntryCursor | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString();
    const [publishedAt, id] = decoded.split("|");
    if (!publishedAt || !id) return null;

    const date = new Date(publishedAt);
    if (Number.isNaN(date.getTime())) return null;

    return { id, publishedAt: date };
  } catch {
    return null;
  }
}

export function getEntryCursorCondition(cursor: EntryCursor) {
  return or(
    lt(entries.publishedAt, cursor.publishedAt),
    and(eq(entries.publishedAt, cursor.publishedAt), lt(entries.id, cursor.id)),
  );
}
