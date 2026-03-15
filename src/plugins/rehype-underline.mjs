/**
 * rehype-underline: no-op
 *
 * Underline conversion is now handled entirely by remark-underline.mjs
 * (which runs at the remark/MDAST stage and is therefore able to
 * distinguish __underline__ from **bold** by inspecting raw source).
 *
 * This file is kept as a placeholder so existing imports in
 * astro.config.mjs continue to resolve without errors.
 */
export default function rehypeUnderline() {
  return () => {};
}
