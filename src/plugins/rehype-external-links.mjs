/** rehype: 外部リンクに target="_blank" rel="noopener noreferrer" を付与 */
import { visit } from "unist-util-visit";

const EXTERNAL_RE = /^https?:\/\//i;

export default function rehypeExternalLinks() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a") return;

      const href = node.properties?.href ?? "";
      if (!EXTERNAL_RE.test(String(href))) return;

      node.properties.target = "_blank";

      // Preserve any existing rel values and add the security tokens
      const existing = [node.properties.rel ?? []].flat().map(String);
      const rel = new Set([...existing, "noopener", "noreferrer"]);
      node.properties.rel = [...rel];
    });
  };
}
