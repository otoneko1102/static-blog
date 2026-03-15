export const SITE_TITLE = "まろんのブログ";
export const SITE_DESCRIPTION =
  "まろんの個人ブログ。技術、イベント、LTなどについて書いています。";
export const SITE_URL = "https://blog.montblank.fun";
export const TWITTER_HANDLE = "@rin_montblank";
export const GITHUB_URL = "https://github.com/otoneko1102";
export const PORTFOLIO_URL = "https://montblank.fun";

/**
 * Canonical sort order used across all pages and navigation:
 *
 *   1. Pinned articles first, sorted among themselves by pubDate descending
 *      (newest pinned article appears at the very top).
 *   2. Non-pinned articles sorted by pubDate descending.
 *
 * This is a pure function — it returns a new sorted array and does not
 * mutate the input.
 */
export function sortPosts<
  T extends { data: { pinned?: boolean; pubDate: Date } },
>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    const ap = a.data.pinned ?? false;
    const bp = b.data.pinned ?? false;

    // One is pinned and the other is not — pinned wins
    if (ap !== bp) return ap ? -1 : 1;

    // Both share the same pinned state — sort by pubDate descending
    return b.data.pubDate.getTime() - a.data.pubDate.getTime();
  });
}
