import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Coerce a date value to a JavaScript Date object.
 *
 * Accepted formats (in addition to any value already a Date):
 *   "2026-03-15"          → 2026-03-15 00:00:00 JST  (UTC+9)
 *   "2026-03-15 09:15"    → 2026-03-15 09:15:00 JST
 *   "2026-03-15T00:00:00.000Z"  → parsed as-is (existing ISO content)
 *   Any other string      → passed to new Date() as a last resort
 */
function toJstDate(val: unknown): Date {
  if (val instanceof Date) return val;

  const s = String(val).trim();

  // "YYYY-MM-DD" — date only, interpret as JST midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00+09:00`);
  }

  // "YYYY-MM-DD HH:mm" / "YYYY-MM-DD H:m" / "YYYY-MM-DD HH:mm:ss" — interpret as JST
  const datetimeMatch = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (datetimeMatch) {
    const [, date, hour, minute, second] = datetimeMatch;
    const hh = hour.padStart(2, '0');
    const mm = minute.padStart(2, '0');
    const ss = (second ?? '0').padStart(2, '0');
    return new Date(`${date}T${hh}:${mm}:${ss}+09:00`);
  }

  // ISO 8601 / RFC 2822 / anything else — let the JS engine handle it
  return new Date(s);
}

/** Zod schema that accepts the human-friendly JST date formats above. */
const jstDate = z.preprocess(toJstDate, z.date());

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string().default(""),
    pubDate: jstDate,
    updatedDate: jstDate.optional(),
    tags: z.array(z.string()).default([]),
    pinned: z.boolean().default(false),
    heroImage: z.string().optional(),
    hidden: z.boolean().default(false),
  }),
});

export const collections = { blog };
