/**
 * remark: GitHub スタイルアラート
 * > [!NOTE] / > [!TIP] / > [!IMPORTANT] / > [!WARNING] / > [!CAUTION]
 */
import { visit } from "unist-util-visit";

const ALERT_TYPES = {
  NOTE: {
    icon: '<iconify-icon icon="material-symbols:info-outline" width="16" height="16" aria-hidden="true"></iconify-icon>',
    className: "alert-note",
    label: "NOTE",
  },
  TIP: {
    icon: '<iconify-icon icon="material-symbols:lightbulb-outline" width="16" height="16" aria-hidden="true"></iconify-icon>',
    className: "alert-tip",
    label: "TIP",
  },
  IMPORTANT: {
    icon: '<iconify-icon icon="material-symbols:priority-high" width="16" height="16" aria-hidden="true"></iconify-icon>',
    className: "alert-important",
    label: "IMPORTANT",
  },
  WARNING: {
    icon: '<iconify-icon icon="material-symbols:warning-outline" width="16" height="16" aria-hidden="true"></iconify-icon>',
    className: "alert-warning",
    label: "WARNING",
  },
  CAUTION: {
    icon: '<iconify-icon icon="material-symbols:error-outline" width="16" height="16" aria-hidden="true"></iconify-icon>',
    className: "alert-caution",
    label: "CAUTION",
  },
};

/** mdast ノードを HTML 文字列にシリアライズ */
function serializeNode(node) {
  switch (node.type) {
    case "text":
      return node.value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    case "html":
      return node.value;

    case "inlineCode":
      return `<code>${node.value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`;

    case "strong": {
      const inner = (node.children ?? []).map(serializeNode).join("");
      const tag = node.data?.hName ?? "strong";
      return `<${tag}>${inner}</${tag}>`;
    }

    case "emphasis": {
      const inner = (node.children ?? []).map(serializeNode).join("");
      return `<em>${inner}</em>`;
    }

    case "delete": {
      const inner = (node.children ?? []).map(serializeNode).join("");
      return `<del>${inner}</del>`;
    }

    case "link": {
      const href = (node.url ?? "").replace(/"/g, "&quot;");
      const inner = (node.children ?? []).map(serializeNode).join("");
      const title = node.title
        ? ` title="${node.title.replace(/"/g, "&quot;")}"`
        : "";
      return `<a href="${href}"${title}>${inner}</a>`;
    }

    case "image": {
      const src = (node.url ?? "").replace(/"/g, "&quot;");
      const alt = (node.alt ?? "").replace(/"/g, "&quot;");
      const title = node.title
        ? ` title="${node.title.replace(/"/g, "&quot;")}"`
        : "";
      return `<img src="${src}" alt="${alt}"${title} />`;
    }
    case "break":
      return "<br>";

    case "paragraph": {
      const inner = (node.children ?? []).map(serializeNode).join("");
      return `<p>${inner}</p>`;
    }

    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const items = (node.children ?? []).map(serializeNode).join("");
      return `<${tag}>${items}</${tag}>`;
    }

    case "listItem": {
      const inner = (node.children ?? []).map(serializeNode).join("");
      return `<li>${inner}</li>`;
    }

    case "code": {
      const lang = node.lang ? ` class="language-${node.lang}"` : "";
      const value = node.value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<pre><code${lang}>${value}</code></pre>`;
    }

    default:
      if (Array.isArray(node.children)) {
        return node.children.map(serializeNode).join("");
      }
      return node.value ?? "";
  }
}

export default function remarkGithubAlerts() {
  return (tree) => {
    visit(tree, "blockquote", (node, index, parent) => {
      if (!node.children?.length) return;

      const firstChild = node.children[0];
      if (firstChild.type !== "paragraph" || !firstChild.children?.length)
        return;

      const firstInline = firstChild.children[0];
      if (firstInline.type !== "text") return;

      const match = firstInline.value.match(
        /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*/i,
      );
      if (!match) return;

      const alertType = match[1].toUpperCase();
      const config = ALERT_TYPES[alertType];
      if (!config) return;

      // Strip the [!TYPE] prefix
      firstInline.value = firstInline.value.slice(match[0].length);

      // Drop the first paragraph if it became empty
      if (!firstInline.value && firstChild.children.length === 1) {
        node.children.shift();
      } else if (!firstInline.value) {
        firstChild.children.shift();
      }

      // Serialise remaining content
      const bodyHtml = node.children.map(serializeNode).join("");

      const html = [
        `<div class="github-alert ${config.className}" role="note">`,
        `  <p class="alert-title">${config.icon} ${config.label}</p>`,
        bodyHtml,
        `</div>`,
      ].join("\n");

      parent.children[index] = {
        type: "html",
        value: html,
      };
    });
  };
}
