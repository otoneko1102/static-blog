/**
 * remark plugin: Auto-link bare URLs in text
 * Converts standalone https://... URLs into clickable links
 */
import { visit } from "unist-util-visit";

const URL_REGEX = /(https?:\/\/[^\s<>\])"]+)/g;

export default function remarkAutoLink() {
  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || parent.type === "link" || parent.type === "html") return;

      const text = node.value;
      if (!URL_REGEX.test(text)) return;

      URL_REGEX.lastIndex = 0;
      const children = [];
      let lastIndex = 0;
      let match;

      while ((match = URL_REGEX.exec(text)) !== null) {
        if (match.index > lastIndex) {
          children.push({
            type: "text",
            value: text.slice(lastIndex, match.index),
          });
        }
        children.push({
          type: "link",
          url: match[1],
          children: [{ type: "text", value: match[1] }],
        });
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < text.length) {
        children.push({
          type: "text",
          value: text.slice(lastIndex),
        });
      }

      if (children.length > 0) {
        parent.children.splice(index, 1, ...children);
        return index + children.length;
      }
    });
  };
}
