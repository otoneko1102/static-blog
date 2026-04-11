/**
 * rehype-underline: no-op
 * 下線変換は remark-underline.mjs で完結。import 互換性のため保持。
 */
export default function rehypeUnderline() {
  return () => {};
}
