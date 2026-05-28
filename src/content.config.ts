import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { dayjs } from "./utils/jst";

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

  // "YYYY-MM-DD" / "YYYY-MM-DD HH:mm" / "YYYY-MM-DD HH:mm:ss" を JST として解釈
  const m = s.match(
    /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  );
  if (m) {
    const [, date, hour = "0", minute = "0", second = "0"] = m;
    const iso =
      `${date}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` +
      `:${second.padStart(2, "0")}+09:00`;
    return dayjs(iso).toDate();
  }

  // ISO 8601 等 → dayjs に委ねる
  const d = dayjs(s);
  return d.isValid() ? d.toDate() : undefined;
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
