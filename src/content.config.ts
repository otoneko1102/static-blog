import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * 日付値を JST として Date に変換する。
 * "2026-03-15" → JST 00:00, "2026-03-15 09:15" → JST 09:15, ISO文字列はそのまま。
 */
function toJstDate(val: unknown): Date | undefined {
  if (val instanceof Date) return val;
  if (val == null) return undefined;

  const s = String(val).trim();
  if (s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined")
    return undefined;

  // "YYYY-MM-DD" — date only, interpret as JST midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00+09:00`);
  }

  // "YYYY-MM-DD HH:mm" / "YYYY-MM-DD HH:mm:ss" → JST
  const datetimeMatch = s.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/,
  );
  if (datetimeMatch) {
    const [, date, hour, minute, second] = datetimeMatch;
    const hh = hour.padStart(2, "0");
    const mm = minute.padStart(2, "0");
    const ss = (second ?? "0").padStart(2, "0");
    return new Date(`${date}T${hh}:${mm}:${ss}+09:00`);
  }

  // ISO 8601 等 → JS エンジンに委ねる
  return new Date(s);
}

/** JST 日付フォーマットを受け付ける Zod スキーマ */
const jstDate = z.preprocess(toJstDate, z.date());

/** nullable 版（updatedDate 用） */
const jstNullableDate = z.preprocess(toJstDate, z.date().nullable());

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(""),
    pubDate: jstDate,
    updatedDate: z.union([jstNullableDate, z.null()]).optional(),
    tags: z
      .array(z.string())
      .default([])
      .transform((tags) => [...tags].sort((a, b) => a.localeCompare(b, "ja"))),
    pinned: z.boolean().default(false),
    heroImage: z.string().optional(),
    hidden: z.boolean().default(false),
  }),
});

export const collections = { blog };
